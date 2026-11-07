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
 * 手动添加的成员：没有绑定登录账号（elders.user_id 为空），一般是家里的老人或小孩。
 * 这类成员在家庭组内不做成员间授权，人人可编辑。
 */
function isManualMember(elder) {
  return !!elder && !elder.user_id;
}

/** 是否是某个家庭组的成员（user_families 优先，兼容旧模型的 users.family_id） */
async function isFamilyMember(pool, userId, familyId) {
  if (!userId || !familyId) return false;
  const [rows] = await pool.query(
    'SELECT id FROM user_families WHERE user_id = ? AND family_id = ? LIMIT 1',
    [userId, familyId]
  );
  if (rows.length > 0) return true;
  const [users] = await pool.query('SELECT family_id FROM users WHERE id = ? LIMIT 1', [userId]);
  return users.length > 0 && users[0].family_id === familyId;
}

/** 是否是某个家庭组的管理员（user_families.role 优先，兼容旧模型的 users.role） */
async function isFamilyAdmin(pool, userId, familyId) {
  if (!userId || !familyId) return false;
  const [rows] = await pool.query(
    'SELECT role FROM user_families WHERE user_id = ? AND family_id = ? LIMIT 1',
    [userId, familyId]
  );
  if (rows.length > 0) return rows[0].role === 'admin';
  const [users] = await pool.query('SELECT role, family_id FROM users WHERE id = ? LIMIT 1', [userId]);
  return users.length > 0 && users[0].family_id === familyId && users[0].role === 'admin';
}

/**
 * 检查当前用户是否可以修改指定老人（elderId）的资料
 * 规则：
 *   1. 该老人是当前用户的 self 档案（elder.user_id === currentUserId）→ 允许
 *   2. 手动添加的成员（无 user_id）→ 家庭组内所有成员都允许，不做授权控制
 *   3. 其他注册成员 → member_authorizations 中存在 granter=该老人, grantee=我, authorized=true → 允许
 *
 * @param {string} [familyId] 当前家庭上下文。传了就要求档案属于该家庭，避免跨家庭放权。
 */
async function canModifyElder(pool, elderId, currentUserId, familyId = null) {
  if (!elderId || !currentUserId) return false;
  const [elders] = await pool.query(
    'SELECT id, user_id, family_id FROM elders WHERE id = ? LIMIT 1',
    [elderId]
  );
  if (elders.length === 0) return false;
  const elder = elders[0];
  // 是自己的 self 档案 → 允许
  if (elder.user_id && elder.user_id === currentUserId) return true;
  // 手动添加的成员 → 家庭组内人人可编辑
  if (isManualMember(elder)) {
    if (familyId && elder.family_id !== familyId) return false;
    return isFamilyMember(pool, currentUserId, elder.family_id);
  }
  // 其他注册成员：检查授权记录（对方 granter 授权了我 grantee 修改）
  const [authRows] = await pool.query(
    'SELECT authorized FROM member_authorizations WHERE granter_user_id = ? AND grantee_user_id = ? LIMIT 1',
    [elder.user_id, currentUserId]
  );
  return authRows.length > 0 && !!authRows[0].authorized;
}

/**
 * 成员档案是否允许「删除」。
 * 只有手动添加的成员（无登录账号）可删；绑定了登录账号的档案要走「移出家庭组」，
 * 否则等于把别人的账号档案一并处理掉。
 */
function checkElderDeletable(elder) {
  if (!elder) return '成员档案不存在';
  if (!isManualMember(elder)) return '该成员已绑定登录账号，请使用「移出家庭组」';
  return '';
}

module.exports = {
  familyAccessFilter,
  isManualMember,
  isFamilyMember,
  isFamilyAdmin,
  canModifyElder,
  checkElderDeletable
};
