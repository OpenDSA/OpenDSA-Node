# Production image for the Express/Prisma backend.
# Build from the REPO ROOT (not this directory), since this is an npm
# workspaces monorepo and the install step needs the root package.json +
# lockfile plus the sibling workspace's package.json for resolution:
#
#   docker build -f apps/backend/Dockerfile -t <tag> .

FROM node:24-alpine AS base
WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/web/package.json apps/web/

FROM base AS build
RUN npm install
COPY apps/backend apps/backend
RUN npm run build -w apps/backend

FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/backend ./apps/backend

WORKDIR /app/apps/backend
EXPOSE 3000
CMD ["node", "dist/index.js"]
