const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authMiddleware } = require('../middleware/auth');
const { recognizeText, parse, isConfigured } = require('../services/ocr');

router.use(authMiddleware);

// multer 内存存储：仅用于接收图片做 OCR，不落盘 MinIO
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

/**
 * POST /api/ocr/recognize
 * multipart: files (多张图片) + type (record|report|prescription|drug)
 * 流程：仅调百度 OCR 识别 → 结构化解析（不保存到 MinIO/DB）
 * 图片的持久化保存在用户确认后由前端调 /api/upload 完成
 * 返回: { text, parsed }
 */
router.post('/recognize', upload.array('files', 9), async (req, res) => {
  try {
    const files = req.files;
    const type = req.body.type || 'record';

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '没有上传图片' });
    }

    if (!isConfigured()) {
      return res.status(500).json({ error: '未配置百度OCR密钥，请在 .env 设置 BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY' });
    }

    // 逐张识别并拼接文本
    const textParts = [];
    let lastOcrError = null;
    for (const file of files) {
      try {
        const { text } = await recognizeText(file.buffer);
        if (text) textParts.push(text);
      } catch (err) {
        if (err.code === 'OCR_NOT_CONFIGURED' || err.code === 'OCR_TOKEN_ERROR') throw err;
        lastOcrError = err;
        console.error('OCR recognize single error:', err.message);
      }
    }
    const text = textParts.join('\n');
    // 所有图片都识别失败时，向前端返回明确错误
    if (!text && lastOcrError) {
      return res.status(500).json({ error: lastOcrError.message });
    }

    // 按类型结构化解析
    const parsed = parse(type, text);

    res.json({ text, parsed });
  } catch (err) {
    console.error('OCR recognize error:', err);
    if (err.code === 'OCR_NOT_CONFIGURED') {
      return res.status(500).json({ error: '未配置百度OCR密钥' });
    }
    res.status(500).json({ error: err.message || 'OCR识别失败' });
  }
});

module.exports = router;
