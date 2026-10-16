# Production image for the React/Vite frontend.
# Build from the REPO ROOT (not this directory) for the same monorepo
# workspace-resolution reason as apps/backend/Dockerfile:
#
#   docker build -f apps/web/Dockerfile -t <tag> .

FROM node:24-alpine AS base
WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/web/package.json apps/web/

FROM base AS build
RUN npm install
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM nginx:alpine AS production
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
