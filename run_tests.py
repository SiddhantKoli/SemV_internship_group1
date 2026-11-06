#!/usr/bin/env python3
"""Run the AquaPulse local API QA cases and save actual responses for review.

Standard-library only. This script sends requests only when the user runs it;
it does not start the application or fabricate chatbot answers.
"""

import argparse
import concurrent.futures
import json
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
TIMEOUT_SECONDS = 200
MAX_LATENCY_SECONDS = 60
FACTUAL_HINT = re.compile(
    r"\b(?:is|are|was|were|reports|recorded|measured|issued|located|"
    r"temperature|rainfall|wind|price|warning|alert|forecast|fish|"
    r"village|taluka|percent|mm|km/h|₹|INR)\b|\b\d+(?:\.\d+)?",
    re.IGNORECASE,
)
MARKDOWN_HINT = re.compile(r"```|`|\*\*|__|^\s{0,3}#{1,6}\s|^\s*[-*+]\s", re.MULTILINE)
URL_HINT = re.compile(r"https?://[^\s<>\]\[(){}\"']+", re.IGNORECASE)
CITATION_HINT = re.compile(r"\[(S\d+)\]")
_PRINT_LOCK = threading.Lock()


def configure_console():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def load_cases(folder):
    cases = []
    for path in sorted(folder.glob("cases*.json")):
        try:
            content = json.loads(path.read_text(encoding="utf-8-sig"))
        except Exception as exc:
            raise ValueError(f"Could not read {path.name}: {exc}") from exc
        if isinstance(content, dict):
            content = content.get("cases", [])
        if not isinstance(content, list):
            raise ValueError(f"{path.name} must contain a list or an object with a 'cases' list.")
        for case in content:
            if not isinstance(case, dict):
                raise ValueError(f"Every case in {path.name} must be an object.")
            case = dict(case)
            case.setdefault("_case_file", path.name)
            cases.append(case)
    return cases


def response_sources(payload):
    sources = payload.get("sources", []) if isinstance(payload, dict) else []
    if not isinstance(sources, list):
        return []
    return [item for item in sources if isinstance(item, dict)]


def normalize_url(value):
    return (value or "").rstrip(".,;:!?\"'`)")


def run_request(base_url, method, path, body=None):
    url = urllib.parse.urljoin(base_url.rstrip("/") + "/", str(path).lstrip("/"))
    headers = {"Accept": "application/json"}
    data = None
    if method.upper() not in ("GET", "HEAD") or body is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
        if isinstance(body, str):
            data = body.encode("utf-8")
        elif body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    started = time.perf_counter()
    status = None
    raw_text = ""
    transport_error = None
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            status = response.status
            raw_text = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        status = exc.code
        try:
            raw_text = exc.read().decode("utf-8", errors="replace")
        except Exception:
            raw_text = str(exc)
    except Exception as exc:
        transport_error = f"{type(exc).__name__}: {exc}"
        raw_text = transport_error
    latency = time.perf_counter() - started
    try:
        payload = json.loads(raw_text) if raw_text else None
    except json.JSONDecodeError:
        payload = None
    return {
        "full_request": {"method": method.upper(), "url": url, "body": body},
        "http_status": status,
        "latency_seconds": round(latency, 3),
        "raw_response": raw_text,
        "parsed_response": payload,
        "answer": payload.get("answer") if isinstance(payload, dict) else None,
        "model": payload.get("model") if isinstance(payload, dict) else None,
        "sources": payload.get("sources", []) if isinstance(payload, dict) else [],
        "retrieved_chunks": payload.get("retrieved_chunks") if isinstance(payload, dict) else None,
        "transport_error": transport_error,
    }


def as_list(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def expected_status_ok(actual, expected):
    if expected is None:
        return True
    return actual in as_list(expected)


def check_response(result, expect):
    answer = result.get("answer") or ""
    model = result.get("model")
    sources = response_sources(result.get("parsed_response"))
    source_citations = {
        str(item.get("citation", "")).strip()
        for item in sources
        if item.get("citation") is not None
    }
    # Some API responses expose source IDs while the UI labels them S1, S2, etc.
    source_citations.update(f"S{i}" for i in range(1, len(sources) + 1))
    cited_ids = CITATION_HINT.findall(answer)
    dangling_citations = sorted({citation for citation in cited_ids if citation not in source_citations})

    response_urls = [normalize_url(url) for url in URL_HINT.findall(answer)]
    known_urls = {normalize_url(str(item.get("url", ""))) for item in sources if item.get("url")}
    unsupported_urls = sorted(url for url in response_urls if url not in known_urls)
    factual_without_sources = bool(answer.strip() and not sources and FACTUAL_HINT.search(answer))
    markdown_found = bool(MARKDOWN_HINT.search(answer))

    checks = {
        "expected_status": {
            "passed": expected_status_ok(result.get("http_status"), expect.get("status")),
            "expected": expect.get("status"),
            "actual": result.get("http_status"),
        },
        "expected_model_route": {"passed": True, "expected": expect.get("model_in"), "actual": model},
        "must_match": [],
        "must_not_match": [],
        "citation_ids_exist": {"passed": not dangling_citations, "dangling": dangling_citations},
        "factual_claims_have_sources": {"passed": not factual_without_sources, "flagged": factual_without_sources},
        "answer_urls_are_in_sources": {"passed": not unsupported_urls, "unsupported_urls": unsupported_urls},
        "plain_text_format": {"passed": not markdown_found, "markdown_marker_found": markdown_found},
        "latency_under_60_seconds": {
            "passed": result.get("latency_seconds", 0) <= MAX_LATENCY_SECONDS,
            "seconds": result.get("latency_seconds"),
        },
    }

    model_needles = as_list(expect.get("model_in"))
    if model_needles:
        checks["expected_model_route"]["passed"] = any(
            needle.lower() in str(model or "").lower() for needle in model_needles
        )
    for pattern in as_list(expect.get("must_match")):
        try:
            matched = bool(re.search(pattern, answer, re.IGNORECASE | re.MULTILINE))
            error = None
        except re.error as exc:
            matched, error = False, str(exc)
        checks["must_match"].append({"pattern": pattern, "passed": matched, "regex_error": error})
    for pattern in as_list(expect.get("must_not_match")):
        try:
            matched = bool(re.search(pattern, answer, re.IGNORECASE | re.MULTILINE))
            error = None
        except re.error as exc:
            matched, error = False, str(exc)
        checks["must_not_match"].append({"pattern": pattern, "passed": not matched, "regex_error": error})
    checks["must_match_passed"] = all(item["passed"] for item in checks["must_match"])
    checks["must_not_match_passed"] = all(item["passed"] for item in checks["must_not_match"])
    return checks


def record_case_request(base_url, method, path, body, expect):
    result = run_request(base_url, method, path, body)
    result["automatic_checks"] = check_response(result, expect)
    return result


def make_concurrent_bodies(body, count):
    template = dict(body) if isinstance(body, dict) else {"message": str(body or "")}
    original = str(template.get("message", "AquaPulse concurrent smoke question"))
    return [dict(template, message=f"{original} [parallel request {index + 1}]") for index in range(count)]


def execute_case(base_url, case):
    method = str(case.get("method", "POST")).upper()
    path = case.get("path", "/api/chat")
    body = case.get("body")
    expect = case.get("expect", {})
    special = case.get("special")
    started = time.perf_counter()

    if special == "concurrent_chat":
        count = int(case.get("parallel_requests", 10))
        bodies = make_concurrent_bodies(body, count)
        with concurrent.futures.ThreadPoolExecutor(max_workers=count) as pool:
            futures = [pool.submit(record_case_request, base_url, "POST", path, item, expect) for item in bodies]
            requests = [future.result() for future in futures]
        return {
            "full_request": {"method": "POST", "path": path, "parallel_requests": count, "body_template": body},
            "http_status": [item["http_status"] for item in requests],
            "latency_seconds": round(time.perf_counter() - started, 3),
            "raw_response": "Parallel response bundle; see requests[].raw_response.",
            "requests": requests,
            "automatic_checks": aggregate_checks(requests),
        }

    if special == "reindex_while_chatting":
        count = int(case.get("parallel_requests", 10))
        chat_bodies = make_concurrent_bodies(body, count)
        all_jobs = [("chat", "/api/chat", item) for item in chat_bodies]
        all_jobs.append(("reindex", "/api/knowledge/reindex", None))

        def submit_job(job):
            label, job_path, job_body = job
            job_expect = expect if label == "chat" else {"status": 200}
            response = record_case_request(base_url, "POST", job_path, job_body, job_expect)
            response["operation"] = label
            return response

        with concurrent.futures.ThreadPoolExecutor(max_workers=count + 1) as pool:
            futures = [pool.submit(submit_job, job) for job in all_jobs]
            requests = [future.result() for future in futures]
        return {
            "full_request": {"parallel_chat_requests": count, "reindex_request": {"method": "POST", "path": "/api/knowledge/reindex"}, "chat_body_template": body},
            "http_status": [item["http_status"] for item in requests],
            "latency_seconds": round(time.perf_counter() - started, 3),
            "raw_response": "Concurrent reindex/chat response bundle; see requests[].raw_response.",
            "requests": requests,
            "automatic_checks": aggregate_checks(requests),
        }

    if special == "cold_start_sequence":
        first = record_case_request(base_url, method, path, body, expect)
        warm = record_case_request(base_url, method, path, body, expect)
        return {
            "full_request": first["full_request"],
            "http_status": [first["http_status"], warm["http_status"]],
            "latency_seconds": round(time.perf_counter() - started, 3),
            "raw_response": "Cold/warm timing sequence; see requests[].raw_response.",
            "requests": [dict(first, timing_label="first request in this runner sequence"), dict(warm, timing_label="immediate follow-up")],
            "automatic_checks": aggregate_checks([first, warm]),
            "cold_start_note": "This measures first-vs-warm request only. Stop/restart Ollama or the app first if a true cold start is required.",
        }

    return record_case_request(base_url, method, path, body, expect)


def aggregate_checks(requests):
    checks = [item.get("automatic_checks", {}) for item in requests]
    names = sorted({name for group in checks for name in group})
    aggregate = {}
    for name in names:
        values = [group[name] for group in checks if name in group]
        if values and all(isinstance(value, dict) and "passed" in value for value in values):
            aggregate[name] = {"passed": all(value["passed"] for value in values), "items": values}
        else:
            aggregate[name] = {"items": values}
    return aggregate


def compare_runs(runs):
    if len(runs) < 2:
        return {"performed": False, "different": None, "note": "Run with --runs 2 or more to compare outputs."}
    signatures = []
    for run in runs:
        items = run.get("requests", [run])
        signatures.append([
            (item.get("http_status"), item.get("model"), re.sub(r"\s+", " ", item.get("answer") or "").strip())
            for item in items
        ])
    different = any(signature != signatures[0] for signature in signatures[1:])
    return {"performed": True, "different": different, "signatures": signatures}


def failed_checks(checks):
    failures = []
    for name, value in checks.items():
        if isinstance(value, dict) and value.get("passed") is False:
            failures.append(name)
        elif name in ("must_match", "must_not_match") and isinstance(value, list):
            if any(item.get("passed") is False for item in value):
                failures.append(name)
    if checks.get("must_match_passed") is False:
        failures.append("must_match")
    if checks.get("must_not_match_passed") is False:
        failures.append("must_not_match")
    return sorted(set(failures))


def summarize_record(record):
    requests = []
    for run in record.get("runs", [record]):
        requests.extend(run.get("requests", [run]))
    statuses = ",".join(str(item.get("http_status")) for item in requests)
    models = ",".join(str(item.get("model") or "—") for item in requests)
    latencies = ",".join(f"{item.get('latency_seconds', 0):.2f}" for item in requests)
    answers = [re.sub(r"\s+", " ", item.get("answer") or item.get("raw_response", "")).strip() for item in requests]
    answer_preview = answers[0][:180] + ("…" if len(answers[0]) > 180 else "") if answers else "—"
    failures = failed_checks(record.get("automatic_checks", {}))
    return statuses, models, latencies, answer_preview, failures


def write_markdown(path, report):
    lines = [
        "# AquaPulse QA run results",
        "",
        f"- Base URL: `{report['base_url']}`",
        f"- Started: {report['started_at_utc']}",
        f"- Cases: {report['case_count']} · runs per case: {report['runs_per_case']}",
        "- These are actual recorded responses. Review full requests and raw response bodies in `results.json`.",
        "",
        "| Case | Category | HTTP status | Model route | Latency (s) | Auto-check flags | Actual answer preview |",
        "|---|---|---:|---|---:|---|---|",
    ]
    for item in report["cases"]:
        statuses, models, latencies, preview, failures = summarize_record(item)
        category = item.get("category", "")
        lines.append(
            f"| {item.get('id', '')} | {category} | {statuses} | {models} | {latencies} | "
            f"{', '.join(failures) if failures else 'none'} | {preview.replace(chr(124), chr(92) + chr(124))} |"
        )
    lines.extend([
        "",
        "## Manual checks still required",
        "",
        "See `QA_TESTING.md` for the manual checklist. Automated checks do not replace review of source grounding, safety, and answer quality.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    configure_console()
    parser = argparse.ArgumentParser(description="Run AquaPulse API QA cases and capture actual bot answers.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8765", help="AquaPulse API root (default: http://127.0.0.1:8765)")
    parser.add_argument("--runs", type=int, default=2, help="Repeat each case this many times (default: 2)")
    parser.add_argument("--out", default="results.json", help="JSON results output path (default: results.json)")
    parser.add_argument("--only", help="Run only cases whose category exactly matches this value")
    parser.add_argument("--delay", type=float, default=0.0, help="Seconds to wait between cases (default: 0)")
    args = parser.parse_args()
    if args.runs < 1:
        parser.error("--runs must be at least 1")
    if args.delay < 0:
        parser.error("--delay cannot be negative")

    cases = load_cases(ROOT)
    if args.only:
        cases = [case for case in cases if str(case.get("category", "")).casefold() == args.only.casefold()]
    if not cases:
        parser.error("No matching cases found. Add cases*.json beside run_tests.py or adjust --only.")

    report = {
        "format_version": 1,
        "started_at_utc": datetime.now(timezone.utc).isoformat(),
        "base_url": args.base_url.rstrip("/"),
        "runs_per_case": args.runs,
        "case_count": len(cases),
        "cases": [],
    }
    total = len(cases)
    for index, case in enumerate(cases, 1):
        case_result = {key: value for key, value in case.items() if not key.startswith("_")}
        case_result["runs"] = []
        with _PRINT_LOCK:
            print(f"[{index}/{total}] {case.get('id', 'unnamed')} · {case.get('category', '')}", flush=True)
        for run_number in range(args.runs):
            try:
                result = execute_case(args.base_url, case)
            except Exception as exc:
                # One malformed case or local endpoint error must not abort the suite.
                result = {
                    "full_request": {"method": case.get("method"), "path": case.get("path"), "body": case.get("body")},
                    "http_status": None,
                    "latency_seconds": 0,
                    "raw_response": f"Runner failure: {type(exc).__name__}: {exc}",
                    "answer": None,
                    "model": None,
                    "sources": [],
                    "retrieved_chunks": None,
                    "transport_error": f"{type(exc).__name__}: {exc}",
                    "automatic_checks": {"runner_completed": {"passed": False, "error": f"{type(exc).__name__}: {exc}"}},
                }
            case_result["runs"].append({"run_number": run_number + 1, **result})
        case_result["run_comparison"] = compare_runs(case_result["runs"])
        report["cases"].append(case_result)
        if args.delay and index < total:
            time.sleep(args.delay)

    out_path = Path(args.out).expanduser()
    if not out_path.is_absolute():
        out_path = ROOT / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    markdown_path = out_path.with_name("results.md")
    write_markdown(markdown_path, report)

    completed = sum(
        1 for case in report["cases"]
        if all(not run.get("transport_error") and run.get("http_status") is not None for run in case["runs"])
    )
    print(f"Completed {completed}/{total} cases. Actual responses saved to:")
    print(f"  {out_path}")
    print(f"  {markdown_path}")
    print("Upload results.json and your manual notes for Phase 2 grading.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
