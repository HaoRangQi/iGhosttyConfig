FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* bun.lock ./
RUN npm install

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV PUBLIC_GHOSTTY_CONFIG_MODE=remote
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PUBLIC_GHOSTTY_CONFIG_MODE=remote
ENV HOST=0.0.0.0
ENV PORT=3000
ENV BODY_SIZE_LIMIT=2M
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "build"]
