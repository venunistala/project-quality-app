FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /workspace

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @quality-lab/shared build
RUN pnpm --filter @quality-lab/api build
RUN pnpm --filter @quality-lab/api deploy --prod /output

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /output/dist ./dist
COPY --from=build /output/node_modules ./node_modules
COPY --from=build /output/package.json ./package.json
EXPOSE 3001
CMD ["node", "dist/index.js"]
