import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent / ".env")
from api.routes import security_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(" Security Engine started")
    yield
    print("Security Engine shutdown")


app = FastAPI(
    title="EventTruffle Security Engine",
    description="AES-256-GCM encrypted QR code generation and validation",
    version="1.0.0",
    lifespan=lifespan,
)

# Strict CORS: Only allow the Next.js frontend
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for deployment verification."""
    return {"status": "ok", "service": "security-engine"}


app.include_router(security_router, prefix="/security/api/v1", tags=["Security"])


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Prevent stack traces from leaking to client."""
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(type(exc).__name__)},
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENV", "development") == "development",
    )
