FROM node:20-alpine AS builder

WORKDIR /app

COPY backend/package*.json ./backend/

RUN apk add --no-cache python3 make g++ && \
    cd backend && npm ci --only=production && \
    apk del python3 make g++

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/backend/node_modules ./backend/node_modules

COPY backend/src ./backend/src
COPY index.html ./
COPY css ./css
COPY js ./js

EXPOSE 3000

CMD ["node", "backend/src/index.js"]
