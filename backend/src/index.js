require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const { checkDatabase, initDatabase } = require('./config/database');
const { checkMinio, ensureBucket } = require('./services/minio');

// 导入路由
const authRoutes = require('./routes/auth');
const elderRoutes = require('./routes/elders');
const recordRoutes = require('./routes/records');
const medicationRoutes = require('./routes/medications');
const searchRoutes = require('./routes/search');
const uploadRoutes = require('./routes/upload');
const drugRoutes = require('./routes/drugs');

const app = express();
const PORT = process.env.PORT || 3000;
const path = require('path');

// 中间件
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静态文件（前端）
app.use(express.static(path.join(__dirname, '../../')));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/elders', elderRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/medications', medicationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/drugs', drugRoutes);

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
    const shouldRebuild = process.argv.includes('--rebuild');
    const shouldInit = process.argv.includes('--init');

    if (shouldRebuild) {
      // --rebuild: 重建数据库（会清除所有数据！）
      const { rebuildDatabase } = require('./config/database');
      await rebuildDatabase();
      console.log('✓ 数据库重建完成');
    } else if (shouldInit) {
      // --init: 初始化数据库表和MinIO bucket（首次部署使用）
      await initDatabase();
      console.log('✓ 数据库初始化完成');
      await ensureBucket();
      console.log('✓ MinIO 初始化完成');
    } else {
      // 默认：仅检查连通性，不修改任何数据
      await checkDatabase();
      console.log('✓ 数据库连接正常');
      const minioOk = await checkMinio();
      if (minioOk) {
        console.log('✓ MinIO 连接正常');
      } else {
        console.log('⚠ MinIO 不可用，文件上传功能暂不可用');
      }
    }

    app.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('启动失败:', err.message || err);
    console.error(err.stack);
    process.exit(1);
  }
}

startServer();
