FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY server ./server
COPY src/lib ./src/lib
RUN npm run server:build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist-server/index.cjs ./index.cjs
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:${PORT:-8080}/health >/dev/null || exit 1
CMD ["node", "index.cjs"]
