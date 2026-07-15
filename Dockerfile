FROM node:20-alpine

WORKDIR /app

# 直接拷贝宿主机已编译好的node_modules
COPY backend/node_modules ./backend/node_modules
COPY backend/src ./backend/src
COPY index.html ./
COPY css ./css
COPY js ./js

EXPOSE 3000

CMD ["node", "backend/src/index.js"]