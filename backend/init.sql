-- =========================================
-- 家庭健康助手 - 数据库初始化脚本
-- 数据库: MySQL
-- =========================================

-- 创建数据库（指定utf8mb4字符集）
DROP DATABASE IF EXISTS family_health;
CREATE DATABASE family_health DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE family_health;

-- =========================================
-- 1. 用户表
-- =========================================
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY COMMENT '用户ID',
  name VARCHAR(50) NOT NULL COMMENT '姓名',
  phone VARCHAR(20) COMMENT '手机号',
  password VARCHAR(255) NOT NULL COMMENT '密码（加密）',
  role ENUM('admin', 'member', 'readonly') DEFAULT 'member' COMMENT '角色',
  family_id VARCHAR(36) COMMENT '所属家庭ID',
  authorized BOOLEAN DEFAULT FALSE COMMENT '是否允许他人代为编辑',
  avatar VARCHAR(10) COMMENT '头像（姓名首字或emoji）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_family (family_id),
  INDEX idx_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- =========================================
-- 2. 家庭表
-- =========================================
CREATE TABLE IF NOT EXISTS families (
  id VARCHAR(36) PRIMARY KEY COMMENT '家庭ID',
  name VARCHAR(100) NOT NULL DEFAULT '我的家庭' COMMENT '家庭名称',
  invite_code VARCHAR(20) UNIQUE COMMENT '邀请码',
  invite_expiry DATETIME COMMENT '邀请有效期',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家庭表';

-- =========================================
-- 3. 老人档案表
-- =========================================
CREATE TABLE IF NOT EXISTS elders (
  id VARCHAR(36) PRIMARY KEY COMMENT '老人ID',
  family_id VARCHAR(36) NOT NULL COMMENT '所属家庭ID',
  name VARCHAR(50) NOT NULL COMMENT '姓名',
  gender ENUM('男', '女') DEFAULT '男' COMMENT '性别',
  age INT DEFAULT 0 COMMENT '年龄',
  blood_type VARCHAR(20) COMMENT '血型',
  allergies TEXT COMMENT '过敏史',
  conditions TEXT COMMENT '基础疾病',
  phone VARCHAR(20) COMMENT '联系电话',
  avatar VARCHAR(10) COMMENT '头像（姓名首字）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_family (family_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='老人档案表';

-- =========================================
-- 4. 病历记录表
-- =========================================
CREATE TABLE IF NOT EXISTS records (
  id VARCHAR(36) PRIMARY KEY COMMENT '记录ID',
  elder_id VARCHAR(36) NOT NULL COMMENT '关联老人ID',
  family_id VARCHAR(36) NOT NULL COMMENT '所属家庭ID',
  type ENUM('病历', '检查报告', '药方') DEFAULT '病历' COMMENT '记录类型',
  visit_date DATE COMMENT '就诊日期',
  hospital VARCHAR(100) COMMENT '医院/机构',
  department VARCHAR(50) COMMENT '科室',
  diagnosis TEXT COMMENT '诊断结果',
  chief_complaint TEXT COMMENT '主诉',
  metrics JSON COMMENT '检查指标JSON',
  orders TEXT COMMENT '医嘱',
  image_url TEXT COMMENT '原始图片URL',
  confidence DECIMAL(4,2) COMMENT '识别置信度',
  notes JSON COMMENT '家庭备注JSON',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_elder (elder_id),
  INDEX idx_family (family_id),
  INDEX idx_visit_date (visit_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='病历记录表';

-- =========================================
-- 5. 用药计划表
-- =========================================
CREATE TABLE IF NOT EXISTS medications (
  id VARCHAR(36) PRIMARY KEY COMMENT '用药ID',
  elder_id VARCHAR(36) NOT NULL COMMENT '关联老人ID',
  family_id VARCHAR(36) NOT NULL COMMENT '所属家庭ID',
  name VARCHAR(100) NOT NULL COMMENT '药品名称',
  dose VARCHAR(50) COMMENT '每次剂量',
  frequency VARCHAR(50) COMMENT '频次',
  times JSON COMMENT '服用时间JSON数组',
  start_date DATE COMMENT '开始日期',
  end_date DATE COMMENT '结束日期',
  note TEXT COMMENT '备注',
  source_prescription_id VARCHAR(36) COMMENT '来源药方ID',
  reminder BOOLEAN DEFAULT TRUE COMMENT '是否提醒',
  status ENUM('active', 'ended') DEFAULT 'active' COMMENT '状态',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_elder (elder_id),
  INDEX idx_family (family_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用药计划表';

-- =========================================
-- 6. 服药记录表
-- =========================================
CREATE TABLE IF NOT EXISTS med_logs (
  id VARCHAR(36) PRIMARY KEY COMMENT '记录ID',
  med_id VARCHAR(36) NOT NULL COMMENT '关联用药ID',
  scheduled_time DATETIME NOT NULL COMMENT '计划时间',
  actual_time DATETIME COMMENT '实际服用时间',
  marked_by VARCHAR(36) COMMENT '标记人ID',
  missed BOOLEAN DEFAULT FALSE COMMENT '是否漏服',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_med (med_id),
  INDEX idx_scheduled (scheduled_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='服药记录表';

-- =========================================
-- 7. 药品库存表（药箱）
-- =========================================
CREATE TABLE IF NOT EXISTS drug_inventory (
  id VARCHAR(36) PRIMARY KEY COMMENT '库存ID',
  family_id VARCHAR(36) NOT NULL COMMENT '所属家庭ID',
  elder_id VARCHAR(36) COMMENT '关联老人ID（可选）',
  name VARCHAR(100) NOT NULL COMMENT '药品名称',
  specification VARCHAR(100) COMMENT '规格（如 20粒/盒）',
  quantity INT DEFAULT 1 COMMENT '数量（盒/支）',
  expiry_date DATE COMMENT '有效期',
  status ENUM('valid', 'expiring_soon', 'expired') DEFAULT 'valid' COMMENT '状态',
  source_prescription_id VARCHAR(36) COMMENT '来源处方ID',
  note TEXT COMMENT '备注',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_family (family_id),
  INDEX idx_elder (elder_id),
  INDEX idx_status (status),
  INDEX idx_expiry (expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='药品库存表';

-- =========================================
-- 8. 文件表（MinIO元数据）
-- =========================================
CREATE TABLE IF NOT EXISTS files (
  id VARCHAR(36) PRIMARY KEY COMMENT '文件ID',
  family_id VARCHAR(36) NOT NULL COMMENT '所属家庭ID',
  original_name VARCHAR(255) NOT NULL COMMENT '原始文件名',
  minio_key VARCHAR(500) NOT NULL COMMENT 'MinIO存储Key',
  size BIGINT COMMENT '文件大小',
  mime_type VARCHAR(100) COMMENT 'MIME类型',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  INDEX idx_family (family_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文件表';

-- =========================================
-- 完成
-- =========================================
