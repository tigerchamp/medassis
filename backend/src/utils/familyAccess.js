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

/**
 * 检查当前用户是否可以修改指定老人（elderId）的资料
 * 规则：
 *   1. 该老人是当前用户的 self 档案（elder.user_id === currentUserId）→ 允许
 *   2. 或 member_authorizations 表中存在：granter=该老人的user_id, grantee=currentUserId, authorized=true → 允许
 */
async function canModifyElder(pool, elderId, currentUserId) {
  if (!elderId || !currentUserId) return false;
  const [elders] = await pool.query(
    'SELECT id, user_id FROM elders WHERE id = ? LIMIT 1',
    [elderId]
  );
  if (elders.length === 0) return false;
  const elder = elders[0];
  // 是自己的 self 档案 → 允许
  if (elder.user_id && elder.user_id === currentUserId) return true;
  // 检查授权记录：对方（granter）授权了我（grantee）修改
  if (!elder.user_id) return false;
  const [authRows] = await pool.query(
    'SELECT authorized FROM member_authorizations WHERE granter_user_id = ? AND grantee_user_id = ? LIMIT 1',
    [elder.user_id, currentUserId]
  );
  return authRows.length > 0 && !!authRows[0].authorized;
}

module.exports = { familyAccessFilter, canModifyElder };
