const USE_MOCK = process.argv.includes('--mock') || process.argv.includes('--mock-data');

if (USE_MOCK) {
  module.exports = {
    minioClient: null,
    ensureBucket: async () => { console.log('✓ Mock模式: 跳过MinIO初始化'); return true; },
    checkMinio: async () => { console.log('✓ Mock模式: MinIO模拟可用'); return true; },
    uploadFile: async (file, familyId) => ({
      key: `mock://${familyId}/${file.originalname}`,
      url: `mock://${familyId}/${file.originalname}`,
      originalName: file.originalname, size: file.size, mimeType: file.mimetype
    }),
    deleteFile: async () => true,
    getFileUrl: async (key) => key,
    getFileStream: async () => null,
    BUCKET_NAME: 'mock-bucket',
    isAvailable: () => true
  };
  return;
}

const Minio = require('minio');
const { v4: uuidv4 } = require('uuid');

let isAvailable = false;

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'family-health';

// MinIO 连通性检查超时（毫秒）。MinIO 不可达时客户端会无限重试，
// 不设上限会导致启动流程卡死、服务无法监听端口。
const MINIO_CHECK_TIMEOUT_MS = parseInt(process.env.MINIO_CHECK_TIMEOUT_MS) || 3000;

// 给 Promise 加超时保护
function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message || '操作超时')), ms);
    if (timer.unref) timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function ensureBucket() {
  try {
    const exists = await withTimeout(
      minioClient.bucketExists(BUCKET_NAME),
      MINIO_CHECK_TIMEOUT_MS,
      'MinIO 连通性检查超时'
    );
    if (!exists) {
      await withTimeout(
        minioClient.makeBucket(BUCKET_NAME),
        MINIO_CHECK_TIMEOUT_MS,
        'MinIO 创建 bucket 超时'
      );
      console.log(`MinIO bucket '${BUCKET_NAME}' created`);
    }
    isAvailable = true;
    return true;
  } catch (err) {
    console.error('MinIO 初始化失败:', err.message);
    console.error('文件上传功能将不可用，请检查 MinIO 配置');
    isAvailable = false;
    return false;
  }
}

// 仅检查MinIO连通性（不创建bucket）
// 必须加超时保护：MinIO 不可达时 minio 客户端会一直重试，
// 若不设上限，app.listen 之前的 await 会永远挂住 → 整个后端起不来。
async function checkMinio() {
  try {
    const exists = await withTimeout(
      (async () => {
        await minioClient.listBuckets();
        return minioClient.bucketExists(BUCKET_NAME);
      })(),
      MINIO_CHECK_TIMEOUT_MS,
      'MinIO 连通性检查超时'
    );
    if (!exists) {
      console.warn(`MinIO bucket '${BUCKET_NAME}' 不存在，文件上传功能暂不可用，请使用 --init 初始化`);
      isAvailable = false;
    } else {
      isAvailable = true;
    }
    return isAvailable;
  } catch (err) {
    console.error('MinIO 连接失败:', err.message);
    console.error('文件上传功能将不可用，请检查 MinIO 配置');
    isAvailable = false;
    return false;
  }
}

function checkAvailable() {
  if (!isAvailable) {
    throw new Error('MinIO 服务不可用，文件上传功能暂不可用');
  }
}

async function uploadFile(file, familyId) {
  checkAvailable();
  const ext = file.originalname.split('.').pop();
  const key = `families/${familyId}/${uuidv4()}.${ext}`;

  await minioClient.putObject(BUCKET_NAME, key, file.buffer, file.size, file.mimetype);

  const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
  const port = process.env.MINIO_PORT || 9000;
  const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
  const url = `${protocol}://${endpoint}:${port}/${BUCKET_NAME}/${key}`;

  return {
    key,
    url,
    originalName: file.originalname,
    size: file.size,
    mimeType: file.mimetype
  };
}

async function deleteFile(key) {
  if (!isAvailable) return false;
  try {
    await minioClient.removeObject(BUCKET_NAME, key);
    return true;
  } catch (err) {
    console.error('Delete file error:', err.message);
    return false;
  }
}

async function getFileUrl(key) {
  if (!isAvailable) return null;
  try {
    const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
    const port = process.env.MINIO_PORT || 9000;
    const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
    return `${protocol}://${endpoint}:${port}/${BUCKET_NAME}/${key}`;
  } catch (err) {
    console.error('Get file URL error:', err.message);
    return null;
  }
}

async function getFileStream(key) {
  if (!isAvailable) return null;
  try {
    return await minioClient.getObject(BUCKET_NAME, key);
  } catch (err) {
    console.error('Get file stream error:', err.message);
    return null;
  }
}

module.exports = { minioClient, ensureBucket, checkMinio, uploadFile, deleteFile, getFileUrl, getFileStream, BUCKET_NAME, isAvailable: () => isAvailable };
