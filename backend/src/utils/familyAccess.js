/**
 * 家庭组数据访问辅助函数
 * 当用户加入其他家庭组时，其 self 档案关联的 records/medications 等数据
 * 仍归属于原始 family_id，需要通过 user_families 表跨家庭查询。
 */

/**
 * 返回完整的权限过滤 SQL 片段及参数
 * 用于 records/medications/drug_inventory 等表的 WHERE 条件：
 *   <prefix>family_id = ? OR <prefix>elder_id IN (家庭组成员的 self 档案)
 *
 * @param {string} familyId - 当前家庭组 ID
 * @param {string} prefix - 表前缀，如 'r.' / 'm.' / 'di.'，默认为空
 * 返回 { sql, params } 其中 params 是已填充 familyId 的数组
 */
function familyAccessFilter(familyId, prefix = '') {
  return {
    sql: `${prefix}family_id = ? OR ${prefix}elder_id IN (
      SELECT id FROM elders WHERE relation = 'self' AND user_id IN (
        SELECT uf.user_id FROM user_families uf WHERE uf.family_id = ?
        UNION
        SELECT u.id FROM users u WHERE u.family_id = ?
      )
    )`,
    params: [familyId, familyId, familyId]
  };
}

module.exports = { familyAccessFilter };
