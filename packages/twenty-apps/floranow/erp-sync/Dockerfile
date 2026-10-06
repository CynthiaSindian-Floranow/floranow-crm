# Base image pinned to Node 24 Alpine
FROM node:24-alpine AS runner

# Disable interactive Corepack prompt so downloads happen non-interactively
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Install runtime utilities and enable Corepack for Yarn 4
RUN apk add --no-cache curl ca-certificates && \
    corepack enable

WORKDIR /app

# Copy dependency specifications first to leverage Docker layer caching
COPY package.json yarn.lock .yarnrc.yml tsconfig.json ./

# Install dependencies immutably
RUN yarn install --immutable

# Copy application source code
COPY src ./src
COPY entrypoint.sh ./entrypoint.sh

# Set executable permissions and grant ownership to non-root node user
RUN chmod +x ./entrypoint.sh && \
    chown -R node:node /app

# Security: Run as non-root user
USER node

ENTRYPOINT ["./entrypoint.sh"]
CMD ["provision"]
