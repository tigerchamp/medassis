/**
 * entity_files 关联表工具：统一管理业务实体（病历/处方/药品等）的图片
 */
const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * 获取实体的图片列表
 * @param {string} entityType - record / medication / drug_inventory
 * @param {string} entityId
 * @returns {Promise<Array<{id, fileId, url, originalName, sortOrder}>>}
 */
async function getEntityFiles(entityType, entityId) {
  const [rows] = await getPool().query(
    `SELECT ef.id, ef.file_id, ef.sort_order, f.minio_key, f.original_name, f.size, f.mime_type
     FROM entity_files ef
     JOIN files f ON ef.file_id = f.id
     WHERE ef.entity_type = ? AND ef.entity_id = ?
     ORDER BY ef.sort_order ASC, ef.created_at ASC`,
    [entityType, entityId]
  );
  return rows.map(r => ({
    id: r.id,
    fileId: r.file_id,
    url: `/api/upload/file/${encodeURIComponent(r.minio_key)}`,
    originalName: r.original_name,
    size: r.size,
    mimeType: r.mime_type,
    sortOrder: r.sort_order
  }));
}

/**
 * 设置实体的图片列表（全量替换）
 * @param {string} entityType
 * @param {string} entityId
 * @param {string[]} fileIds - file IDs（已通过 upload 接口上传到 files 表）
 */
async function setEntityFiles(entityType, entityId, fileIds) {
  const pool = getPool();
  // 删除旧的关联
  await pool.query(
    'DELETE FROM entity_files WHERE entity_type = ? AND entity_id = ?',
    [entityType, entityId]
  );
  // 插入新的关联
  if (fileIds && fileIds.length > 0) {
    const values = fileIds.map((fid, idx) => [uuidv4(), entityType, entityId, fid, idx]);
    await pool.query(
      'INSERT INTO entity_files (id, entity_type, entity_id, file_id, sort_order) VALUES ?',
      [values]
  );
  }
}

/**
 * 删除实体的所有图片关联
 */
async function deleteEntityFiles(entityType, entityId) {
  await getPool().query(
    'DELETE FROM entity_files WHERE entity_type = ? AND entity_id = ?',
    [entityType, entityId]
  );
}

module.exports = { getEntityFiles, setEntityFiles, deleteEntityFiles };
