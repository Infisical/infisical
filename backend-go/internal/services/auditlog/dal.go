package auditlog

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/database/pg/gen/model"
	"github.com/infisical/api/internal/database/pg/gen/table"
)

// AuditLogRecord represents a single audit log entry for database operations.
type AuditLogRecord struct {
	ID            uuid.UUID
	Actor         string
	ActorMetadata string
	IPAddress     sql.Null[string]
	EventType     string
	EventMetadata sql.Null[string]
	UserAgent     sql.Null[string]
	UserAgentType sql.Null[string]
	ExpiresAt     sql.NullTime
	CreatedAt     time.Time
	UpdatedAt     time.Time
	OrgID         sql.Null[uuid.UUID]
	ProjectID     sql.Null[string]
	ProjectName   sql.Null[string]
}

// DAL provides data access for audit logs.
type DAL struct {
	db pg.DB
}

// NewDAL creates a new audit log DAL.
func NewDAL(db pg.DB) *DAL {
	return &DAL{db: db}
}

// Create inserts a new audit log record.
func (d *DAL) Create(ctx context.Context, record *AuditLogRecord) error {
	auditLogs := table.AuditLogs

	stmt := auditLogs.INSERT(
		auditLogs.ID,
		auditLogs.Actor,
		auditLogs.ActorMetadata,
		auditLogs.IpAddress,
		auditLogs.EventType,
		auditLogs.EventMetadata,
		auditLogs.UserAgent,
		auditLogs.UserAgentType,
		auditLogs.ExpiresAt,
		auditLogs.CreatedAt,
		auditLogs.UpdatedAt,
		auditLogs.OrgId,
		auditLogs.ProjectId,
		auditLogs.ProjectName,
	).MODEL(model.AuditLogs{
		ID:            record.ID,
		Actor:         record.Actor,
		ActorMetadata: record.ActorMetadata,
		IpAddress:     record.IPAddress,
		EventType:     record.EventType,
		EventMetadata: record.EventMetadata,
		UserAgent:     record.UserAgent,
		UserAgentType: record.UserAgentType,
		ExpiresAt:     record.ExpiresAt,
		CreatedAt:     record.CreatedAt,
		UpdatedAt:     record.UpdatedAt,
		OrgId:         record.OrgID,
		ProjectId:     record.ProjectID,
		ProjectName:   record.ProjectName,
	})

	_, err := stmt.ExecContext(ctx, d.db.Primary())
	return err
}
