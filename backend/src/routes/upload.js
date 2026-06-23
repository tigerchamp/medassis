const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authMiddleware } = require('../middleware/auth');
const { uploadFile, deleteFile } = require('../services/minio');
const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

router.use(authMiddleware);

// 配置 multer 内存存储
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// 上传文件
router.post('/upload', upload.array('files', 9), async (req, res) => {
  try {
    const familyId = req.familyId;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const uploadedFiles = [];
    for (const file of files) {
      const result = await uploadFile(file, familyId);

      // 保存文件信息到数据库
      const id = uuidv4();
      await getPool().query(
        'INSERT INTO files (id, family_id, original_name, minio_key, size, mime_type) VALUES (?, ?, ?, ?, ?, ?)',
        [id, familyId, result.originalName, result.key, result.size, result.mimeType]
      );

      uploadedFiles.push({
        id,
        url: result.url,
        originalName: result.originalName,
        size: result.size
      });
    }

    res.json({ files: uploadedFiles });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: '上传失败' });
  }
});

// 删除文件
router.delete('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const familyId = req.familyId;

    // 从数据库获取文件信息
    const [files] = await getPool().query(
      'SELECT * FROM files WHERE minio_key = ? AND family_id = ?',
      [decodeURIComponent(key), familyId]
    );

    if (files.length === 0) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 从 MinIO 删除
    await deleteFile(decodeURIComponent(key));

    // 从数据库删除
    await getPool().query('DELETE FROM files WHERE id = ?', [files[0].id]);

    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

module.exports = router;
