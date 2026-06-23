require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./config/database');
const { ensureBucket } = require('./services/minio');

// 导入路由
const authRoutes = require('./routes/auth');
const elderRoutes = require('./routes/elders');
const recordRoutes = require('./routes/records');
const medicationRoutes = require('./routes/medications');
const searchRoutes = require('./routes/search');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/elders', elderRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/medications', medicationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/upload', uploadRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 统计接口（首页用）
app.get('/api/stats', require('./middleware/auth').authMiddleware, async (req, res) => {
  const searchController = require('./controllers/searchController');
  await searchController.getStats(req, res);
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// 启动服务器
async function startServer() {
  try {
    // 初始化数据库
    await initDatabase();
    console.log('数据库初始化完成');

    // 初始化 MinIO bucket
    await ensureBucket();
    console.log('MinIO 初始化完成');

    app.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
      console.log(`API 地址: http://localhost:${PORT}/api`);
    });
  } catch (err) {
    console.error('启动失败:', err);
    process.exit(1);
  }
}

startServer();
