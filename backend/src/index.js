require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
// 统一设置进程时区为中国时区（UTC+8），确保所有 Date 操作返回国内时间
process.env.TZ = 'Asia/Shanghai';

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
const ocrRoutes = require('./routes/ocr');
const drugRoutes = require('./routes/drugs');
const drugLibraryRoutes = require('./routes/drugLibrary');
const hospitalRoutes = require('./routes/hospitals');
const departmentRoutes = require('./routes/departments');
const feedbackRoutes = require('./routes/feedback');
const logger = require('./utils/logger');

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

// API 请求日志：记录每个接口的方法/URL/状态码/耗时/入参（敏感字段已脱敏）
// 仅作用于 /api 前缀，避免记录静态资源；日志按天分文件并按大小切片
app.use('/api', logger.requestLogger);

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/elders', elderRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/medications', medicationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/drugs', drugRoutes);
app.use('/api/drug-library', drugLibraryRoutes);
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/feedback', feedbackRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 统计接口（首页用）
app.get('/api/stats', require('./middleware/auth').authMiddleware, async (req, res) => {
  const searchController = require('./controllers/searchController');
  await searchController.getStats(req, res);
});

// 全局错误日志 + 兜底处理（记录堆栈与请求信息，便于生产环境排查）
app.use(logger.errorLogger);

// 启动服务器
async function startServer() {
  logger.info(`服务启动中 (mode=${process.argv.includes('--mock') ? 'mock' : 'normal'}, port=${PORT})`);
  try {
    const useMock = process.argv.includes('--mock') || process.argv.includes('--mock-data');
    const shouldRebuild = process.argv.includes('--rebuild');
    const shouldInit = process.argv.includes('--init');

    if (useMock) {
      console.log('✓ Mock模式: 使用内存数据库, 跳过MySQL/MinIO连接');
    } else if (shouldRebuild) {
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
      logger.info(`服务器启动成功，监听端口 ${PORT} (http://localhost:${PORT})`);
      console.log(`服务器运行在 http://localhost:${PORT}`);
    });
  } catch (err) {
    logger.error('服务启动失败', { message: err.message || String(err), stack: err.stack });
    console.error('启动失败:', err.message || err);
    console.error(err.stack);
    process.exit(1);
  }
}

startServer();
