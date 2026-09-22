FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile --filter @fusion-blotter/backend... --filter @fusion-blotter/shared

FROM deps AS build
COPY tsconfig.base.json tsconfig.base.json
COPY database database
COPY shared shared
COPY backend backend
RUN pnpm --filter @fusion-blotter/backend exec prisma generate
RUN pnpm --filter @fusion-blotter/backend build

# Backend ships and runs as TypeScript source via tsx — Prisma 7's
# "prisma-client" generator emits its client as source too (backend/generated),
# so there is no compile-to-JS step to make a dist/ artifact from.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/shared /app/shared
COPY --from=build /app/backend /app/backend
COPY --from=build /app/database /app/database
WORKDIR /app/backend
EXPOSE 4000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm run seed && pnpm start"]
