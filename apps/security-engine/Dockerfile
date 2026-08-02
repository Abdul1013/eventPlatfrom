FROM python:3.12-slim

WORKDIR /app

# Install deps first (layer-cached)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source (excludes venv, __pycache__ via .dockerignore)
COPY . .

EXPOSE 8000

# PORT is injected by Render at runtime
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
