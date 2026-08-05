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
 * POST /api/ocr/parse
 * body: { type: record|report|prescription|drug, text: '识别文本' }
 * 仅做结构化解析（不调用百度OCR），供前端粘贴文本自动识别使用
 * 返回: { parsed }
 */
router.post('/parse', (req, res) => {
  try {
    const { type, text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: '文本内容不能为空' });
    }
    const parsed = parse(type || 'record', text);
    console.log(`[OCR/parse] type=${type}, 文本长度=${text.length}, 解析结果:`, JSON.stringify(parsed).substring(0, 200));
    res.json({ parsed });
  } catch (err) {
    console.error('[OCR/parse] 异常:', err);
    res.status(500).json({ error: '文本解析失败' });
  }
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

    console.log(`[OCR] 收到请求: type=${type}, 文件数=${files ? files.length : 0}`);
    if (files && files.length) {
      files.forEach((f, i) => console.log(`[OCR]   文件${i}: ${f.originalname}, size=${f.size}, mime=${f.mimetype}`));
    }

    if (!files || files.length === 0) {
      console.log('[OCR] 拒绝: 没有上传图片');
      return res.status(400).json({ error: '没有上传图片' });
    }

    if (!isConfigured()) {
      console.log('[OCR] 拒绝: 未配置百度OCR密钥');
      return res.status(500).json({ error: '未配置百度OCR密钥，请在 .env 设置 BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY' });
    }

    // 逐张识别并拼接文本
    const textParts = [];
    let lastOcrError = null;
    for (const file of files) {
      try {
        console.log(`[OCR] 开始识别: ${file.originalname} (${file.size} bytes)`);
        const { text, wordsCount } = await recognizeText(file.buffer);
        console.log(`[OCR] 识别完成: ${wordsCount} 行文字\n[OCR] 识别内容:\n${text}`);
        if (text) textParts.push(text);
      } catch (err) {
        if (err.code === 'OCR_NOT_CONFIGURED' || err.code === 'OCR_TOKEN_ERROR') throw err;
        lastOcrError = err;
        console.error(`[OCR] 识别失败: ${file.originalname} -> ${err.message}`);
      }
    }
    const text = textParts.join('\n');
    console.log(`[OCR] 拼接后文本长度=${text.length}`);
    // 所有图片都识别失败时，向前端返回明确错误
    if (!text && lastOcrError) {
      console.log('[OCR] 所有图片识别失败，返回错误');
      return res.status(500).json({ error: lastOcrError.message });
    }

    // 按类型结构化解析
    const parsed = parse(type, text);
    console.log(`[OCR] 解析结果(type=${type}):`, JSON.stringify(parsed));

    res.json({ text, parsed });
    console.log('[OCR] 响应已返回前端');
  } catch (err) {
    console.error('[OCR] 路由异常:', err);
    if (err.code === 'OCR_NOT_CONFIGURED') {
      return res.status(500).json({ error: '未配置百度OCR密钥' });
    }
    res.status(500).json({ error: err.message || 'OCR识别失败' });
  }
});

module.exports = router;
