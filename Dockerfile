FROM node:24-alpine AS base
WORKDIR /app

# Copy root workspace config
COPY package*.json ./
# Copy app-specific package.jsons so npm knows the workspace structure

COPY apps/backend/package.json apps/backend/
COPY apps/web/package.json apps/web/


FROM base AS dev
RUN npm install
CMD ["npm", "run", "dev"]


FROM base AS build
RUN npm install
COPY . .

RUN npm run build --workspaces


#TODO add production profile omitting build tools
