# ---------- Stage 1: Build ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- Stage 2: Serve ----------
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/seed-owner.sh /docker-entrypoint.d/50-seed-owner.sh
RUN chmod +x /docker-entrypoint.d/50-seed-owner.sh
EXPOSE 80
