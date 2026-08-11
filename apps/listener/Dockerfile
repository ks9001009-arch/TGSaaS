# Python (Telethon) MTProto listener service.
# Owns real Telegram user-account sessions, listens for keyword hits and pushes
# matched messages to configured targets. Talks to the same PostgreSQL DB as the
# NestJS API and exposes a small HTTP control API (auth: X-Listener-Token).
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# build deps for cryptography / asyncpg wheels are usually prebuilt; keep slim
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p /sessions \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin listener \
    && chown -R listener:listener /app /sessions

USER listener

EXPOSE 8100
# Bind all interfaces inside the container network only; do not publish 8100 on the host.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${LISTENER_PORT:-8100}"]
