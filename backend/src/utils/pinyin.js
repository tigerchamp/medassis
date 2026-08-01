const { pinyin } = require('pinyin-pro');

/**
 * 获取名称的拼音首字母缩写（如 中国人民解放军总医院 -> ZGRMJFJZYY）
 * 用于医院/科室等名称的拼音检索与缩写
 */
function getPinyinAbbr(name) {
  if (!name || typeof name !== 'string') return '';
  const py = pinyin(name, { pattern: 'first', toneType: 'none' });
  return py.replace(/\s+/g, '').replace(/[^a-zA-Z]/g, '').toUpperCase();
}

module.exports = { getPinyinAbbr };
