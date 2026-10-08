FROM node:20-bookworm-slim

ARG CLAUDE_CODE_VERSION=latest

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
    && npm cache clean --force

WORKDIR /app
COPY package.json ./
COPY src ./src

RUN mkdir -p /workspace /data/home /data/claude-p-telegram

ENV NODE_ENV=production \
    HOME=/data/home \
    CLAUDE_WORKDIR=/workspace \
    STATE_DIR=/data/claude-p-telegram \
    PORT=3000

EXPOSE 3000
CMD ["node", "src/index.js"]
