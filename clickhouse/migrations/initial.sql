CREATE TABLE IF NOT EXISTS audit_logs
(
  id UUID,
  ipAddress String,
  userAgent String,
  userAgentType String,
  expiresAt DateTime64(3),
  createdAt DateTime64(3),
  updatedAt DateTime64(3),
  orgId UUID,
  projectId UUID,
  projectName String,
  event JSON,
  actor JSON
)
ENGINE = MergeTree()
ORDER BY createdAt;
