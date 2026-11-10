FROM node:22-alpine AS build
WORKDIR /src

COPY backend/package.json backend/package-lock.json backend/
RUN npm ci --prefix backend
COPY frontend/package.json frontend/package-lock.json frontend/
RUN npm ci --prefix frontend

COPY backend backend
COPY frontend frontend
RUN npm run build --prefix backend && npm run build --prefix frontend

FROM node:22-alpine
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /src/backend/dist ./dist
COPY --from=build /src/frontend/dist /app/public

ENV NODE_ENV=production STATIC_DIR=/app/public PORT=3001
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]
