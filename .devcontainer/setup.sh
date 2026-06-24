#!/bin/bash

echo "🚀 正在配置 Codespaces 开发环境..."

cd /workspace/backend

if [ ! -f .env ]; then
    cp .env.example .env
    echo "📋 已创建 .env 文件"
fi

sed -i 's/^DB_HOST=localhost/DB_HOST=mysql/' .env
sed -i 's/^DB_PASSWORD=your_password/DB_PASSWORD=root123456/' .env
sed -i 's/^MINIO_ENDPOINT=localhost/MINIO_ENDPOINT=minio/' .env

echo "✅ 环境变量已配置为 Codespaces 模式"

if [ ! -d node_modules ]; then
    echo "📦 正在安装 npm 依赖..."
    npm install
    echo "✅ 依赖安装完成"
else
    echo "📦 依赖已存在，跳过安装"
fi

echo ""
echo "🎉 Codespaces 环境初始化完成！"
echo ""
echo "启动后端服务："
echo "  cd backend && npm start"
echo ""
echo "启动前端服务（新终端）："
echo "  npx http-server -p 8080"