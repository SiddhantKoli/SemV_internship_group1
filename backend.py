import os
from assistant_app import app

if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8765"))
    print(f"Starting AquaPulse backend on http://{host}:{port} ...")
    uvicorn.run("backend:app", host=host, port=port, reload=False)
