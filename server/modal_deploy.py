"""Deploy the StratSquad FastAPI backend to Modal.

Usage:
    # First time only:
    pip install modal
    modal token new                           # browser → paste back

    # Set secrets once (uses your local server/.env)
    modal secret create stratsquad-env --from-dotenv .env

    # Deploy
    modal deploy modal_deploy.py
    # → prints an https://...modal.run URL

    # That URL goes into Vercel as PYTHON_BACKEND_URL.

Modal free tier ships $30/month credits, no card needed.
"""
import modal


app = modal.App("stratsquad")


image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "fastapi>=0.136",
        "uvicorn[standard]>=0.47",
        "langchain>=1.3",
        "langchain-openai>=1.2",
        "langgraph>=1.2",
        "langsmith>=0.8",
        "httpx>=0.28",
        "pydantic>=2.13",
        "python-dotenv>=1.2",
    )
    .add_local_dir("stratsquad", "/root/stratsquad")
    .add_local_dir("corpus", "/root/corpus")
    .add_local_dir("data", "/root/data")
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("stratsquad-env")],
    timeout=600,        # max per request (cold start + full pipeline run with retry)
    min_containers=1,   # keep 1 warm so first request is instant; comment out to save credits
)
@modal.concurrent(max_inputs=8)
@modal.asgi_app()
def fastapi_app():
    """Hand Modal our FastAPI app. SSE streams pass through as is."""
    from stratsquad.main import app as fa_app
    return fa_app
