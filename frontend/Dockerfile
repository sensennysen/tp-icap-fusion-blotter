FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile --filter @fusion-blotter/frontend... --filter @fusion-blotter/shared

FROM deps AS build
ARG VITE_API_BASE_URL
ARG VITE_WS_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
COPY tsconfig.base.json tsconfig.base.json
COPY shared shared
COPY frontend frontend
RUN pnpm --filter @fusion-blotter/frontend build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 5173
RUN sed -i 's/listen\s*80;/listen 5173;/' /etc/nginx/conf.d/default.conf
CMD ["nginx", "-g", "daemon off;"]
