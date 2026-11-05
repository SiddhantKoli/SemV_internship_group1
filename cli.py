#!/usr/bin/env python3
"""
AquaPulse CLI
Unified command-line interface for the AquaPulse local coastal information assistant.
Reuses the exact same backend pipeline as the web application.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

# Ensure UTF-8 output on Windows consoles to prevent charmap encoding errors
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from assistant_app import chat_pipeline


def read_stdin_if_ready(timeout_sec: float = 0.25) -> str | None:
    """Non-blocking check to read piped input without hanging when no input is provided."""
    if sys.stdin.isatty():
        return None

    if sys.platform == "win32":
        try:
            import msvcrt
            import ctypes
            from ctypes import wintypes
            handle = msvcrt.get_osfhandle(sys.stdin.fileno())
            avail = wintypes.DWORD()
            start = time.time()
            while time.time() - start < timeout_sec:
                res = ctypes.windll.kernel32.PeekNamedPipe(
                    handle, None, 0, None, ctypes.byref(avail), None
                )
                if res and avail.value > 0:
                    data = sys.stdin.read().strip()
                    return data if data else None
                time.sleep(0.02)
            return None
        except Exception:
            return None
    else:
        try:
            import select
            r, _, _ = select.select([sys.stdin], [], [], timeout_sec)
            if r:
                data = sys.stdin.read().strip()
                return data if data else None
            return None
        except Exception:
            return None


def run_single_query(
    question: str,
    agent: str | None = None,
    json_output: bool = False,
    top_k: int = 4,
    verbose: bool = False,
    model: str | None = None,
    provider: str = "local",
    history: list[dict] | None = None,
) -> int:
    """Execute a single query through the shared pipeline and format the output."""
    payload = {
        "message": question,
        "agent": agent,
        "history": history or [],
    }

    try:
        result = chat_pipeline(
            payload,
            provider_override=provider,
            model_override=model,
            top_k=top_k,
            verbose=verbose,
        )
    except Exception as exc:
        if json_output:
            print(json.dumps({
                "error": str(exc),
                "answer": f"Error: {exc}",
                "sources": [],
                "agent": agent or "unknown",
                "retrieved_chunks": 0,
                "latency": 0.0,
            }, ensure_ascii=False))
        else:
            print(f"Error: {exc}", file=sys.stderr)
        return 1

    if json_output:
        machine_readable = {
            "answer": result.get("answer", ""),
            "sources": result.get("sources", []),
            "agent": result.get("agent", agent or "ask"),
            "retrieved_chunks": result.get("retrieved_chunks", 0),
            "latency": result.get("latency", 0.0),
            "model": result.get("model", ""),
            "provider": result.get("provider", provider),
        }
        print(json.dumps(machine_readable, ensure_ascii=False, indent=2))
    else:
        active_agent = result.get("agent", agent or "ask").title()
        print(f"\n[AquaPulse · {active_agent}]")
        print(result.get("answer", ""))
        sources = result.get("sources", [])
        if sources:
            print("\nSources:")
            for s in sources:
                cit = s.get("citation", "S")
                title = s.get("title", "")
                url = s.get("url", "")
                print(f"  [{cit}] {title} — {url}" if url else f"  [{cit}] {title}")
        if verbose:
            print(f"\n(latency: {result.get('latency', 0.0)}s | chunks: {result.get('retrieved_chunks', 0)} | model: {result.get('model')})")

    return 0


def interactive_mode(
    agent: str | None = None,
    top_k: int = 4,
    verbose: bool = False,
    model: str | None = None,
    provider: str = "local",
) -> int:
    """Run interactive REPL loop."""
    current_agent = agent or "ask"
    history: list[dict] = []

    print("AquaPulse Coastal Information Assistant — Interactive Mode")
    print(f"Agent: {current_agent} | Provider: {provider} | Model: {model or 'default'}")
    print("Commands: /agent {weather,disaster,fisheries,fish-markets,ask,records}, /clear, /exit\n")

    while True:
        try:
            line = input(f"[{current_agent}] > ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting AquaPulse.")
            break

        if not line:
            continue
        if line.lower() in ("/exit", "/quit", "exit", "quit"):
            print("Exiting AquaPulse.")
            break
        if line.lower() == "/clear":
            history.clear()
            print("Conversation context cleared.")
            continue
        if line.startswith("/agent"):
            parts = line.split(maxsplit=1)
            if len(parts) > 1 and parts[1].strip() in ("weather", "disaster", "fisheries", "fish-markets", "markets", "ask", "records"):
                current_agent = "fish-markets" if parts[1].strip() == "markets" else parts[1].strip()
                history.clear()
                print(f"Switched to {current_agent}. Context cleared.")
            else:
                print("Available agents: weather, disaster, fisheries, fish-markets, ask, records")
            continue

        payload = {
            "message": line,
            "agent": current_agent,
            "history": history,
        }

        try:
            result = chat_pipeline(
                payload,
                provider_override=provider,
                model_override=model,
                top_k=top_k,
                verbose=verbose,
            )
            print(f"\n{result.get('answer', '')}")
            sources = result.get("sources", [])
            if sources:
                print("\nSources:")
                for s in sources:
                    cit = s.get("citation", "S")
                    title = s.get("title", "")
                    url = s.get("url", "")
                    print(f"  [{cit}] {title} — {url}" if url else f"  [{cit}] {title}")
            print()

            history.append({"role": "user", "content": line})
            history.append({"role": "assistant", "content": result.get("answer", "")})
            if len(history) > 6:
                history = history[-6:]
        except Exception as exc:
            print(f"Error: {exc}\n", file=sys.stderr)

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="python cli.py",
        description="AquaPulse: Local coastal information assistant for Palghar district.",
    )
    parser.add_argument(
        "question",
        nargs="?",
        default=None,
        help="Question to ask the assistant. If omitted and not interactive, input is read from stdin.",
    )
    parser.add_argument(
        "--agent",
        choices=["weather", "disaster", "fisheries", "fish-markets", "markets", "ask", "records"],
        default=None,
        help="Specialized agent to handle the question (default: auto-detected or 'ask').",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Start an interactive session.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output machine-readable JSON: answer, sources, agent, retrieved_chunks, latency.",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=4,
        help="Number of retrieved knowledge chunks to pass into context (default: 4).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print verbose retrieval metrics and latency.",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Override the LLM model name (default: llama3.2:3b for local).",
    )
    parser.add_argument(
        "--provider",
        choices=["local", "gemini"],
        default="local",
        help="Inference provider to use (default: local).",
    )

    args = parser.parse_args()

    # Normalize agent argument ('markets' -> 'fish-markets')
    agent = "fish-markets" if args.agent == "markets" else args.agent

    # Interactive mode
    if args.interactive:
        return interactive_mode(
            agent=agent,
            top_k=args.top_k,
            verbose=args.verbose,
            model=args.model,
            provider=args.provider,
        )

    # Determine question from argument or non-blocking stdin
    question = args.question
    if question is None:
        question = read_stdin_if_ready(timeout_sec=0.25)

    if not question:
        if args.json:
            print(json.dumps({
                "error": "No question provided.",
                "answer": "No question provided.",
                "sources": [],
                "agent": agent or "ask",
                "retrieved_chunks": 0,
                "latency": 0.0,
            }))
        else:
            parser.print_help(sys.stderr)
            print("\nError: No question provided via argument or stdin.", file=sys.stderr)
        return 2

    return run_single_query(
        question=question,
        agent=agent,
        json_output=args.json,
        top_k=args.top_k,
        verbose=args.verbose,
        model=args.model,
        provider=args.provider,
    )


if __name__ == "__main__":
    sys.exit(main())
