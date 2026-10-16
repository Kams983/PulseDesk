FROM node:20-alpine

WORKDIR /app

# dependencies first, so editing source does not reinstall them on every rebuild
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 5000

# busybox wget is already in the image, so the health check needs nothing installed
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:5000/api/v1/health > /dev/null || exit 1

CMD ["node", "src/server.js"]
