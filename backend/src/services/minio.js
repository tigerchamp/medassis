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

async function ensureBucket() {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME);
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

module.exports = { minioClient, ensureBucket, uploadFile, deleteFile, getFileUrl, BUCKET_NAME, isAvailable: () => isAvailable };
