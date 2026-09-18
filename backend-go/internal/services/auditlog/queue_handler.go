package auditlog

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/ee/services/license"
	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/queue"
	"github.com/infisical/api/internal/services/project"
)

const auditLogClickHouseStreamKey = "audit-log-stream"

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

// normalizeJSONPayload ensures the payload is an object for ClickHouse.
// Arrays are wrapped in {data: [...]}, objects pass through, others become {}.
func normalizeJSONPayload(payload any) any {
	if payload == nil {
		return map[string]any{}
	}

	switch v := payload.(type) {
	case []any:
		return map[string]any{"data": v}
	case map[string]any:
		return v
	default:
		// For structs (like EventMetadata types), return as-is - json.Marshal handles them
		return payload
	}
}

type projectService interface {
	GetByID(ctx context.Context, projectID string) (*project.Project, error)
}

type licenseService interface {
	GetPlan(ctx context.Context, orgID string) (*license.FeatureSet, error)
}

// QueueHandlerDeps holds dependencies for the audit log queue handler.
type QueueHandlerDeps struct {
	DB       pg.DB
	Project  projectService
	License  licenseService
	Config   *config.Config
	KeyStore keystore.KeyStore
}

// QueueHandler processes audit log tasks from the queue.
type QueueHandler struct {
	logger   *slog.Logger
	db       pg.DB
	project  projectService
	license  licenseService
	config   *config.Config
	keyStore keystore.KeyStore
}

// NewQueueHandler creates a new audit log queue handler.
func NewQueueHandler(_ context.Context, logger *slog.Logger, deps *QueueHandlerDeps) *QueueHandler {
	return &QueueHandler{
		logger:   logger.With(slog.String("queue_handler", "auditlog")),
		db:       deps.DB,
		project:  deps.Project,
		license:  deps.License,
		config:   deps.Config,
		keyStore: deps.KeyStore,
	}
}

// Register registers the audit log queue handler with the queue service.
func (h *QueueHandler) Register(queueSvc *queue.Service) {
	queue.RegisterHandler(queueSvc, TaskAuditLog, h.HandleAuditLog)
}

// HandleAuditLog processes a single audit log task.
func (h *QueueHandler) HandleAuditLog(ctx context.Context, dto *CreateAuditLogDTO) error {
	orgID := dto.OrgID
	var proj *project.Project

	if orgID == nil && dto.ProjectID == nil {
		h.logger.ErrorContext(ctx, "audit log task missing orgId and projectId")
		return fmt.Errorf("missing orgId and projectId")
	}

	if orgID == nil && dto.ProjectID != nil {
		var err error
		proj, err = h.project.GetByID(ctx, *dto.ProjectID)
		if err != nil {
			h.logger.ErrorContext(ctx, "failed to find project for audit log",
				slog.String("projectId", *dto.ProjectID),
				slog.Any("error", err),
			)
			return fmt.Errorf("finding project: %w", err)
		}
		if proj != nil {
			orgID = &proj.OrgID
		}
	}

	if orgID == nil {
		h.logger.ErrorContext(ctx, "could not resolve orgId for audit log")
		return fmt.Errorf("could not resolve orgId")
	}

	plan, err := h.license.GetPlan(ctx, orgID.String())
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to get license plan",
			slog.String("orgId", orgID.String()),
			slog.Any("error", err),
		)
		return fmt.Errorf("getting license plan: %w", err)
	}

	if plan.AuditLogsRetentionDays == 0 {
		return nil
	}

	ttlDays := plan.AuditLogsRetentionDays
	// TODO: Check project-level audit log retention override

	now := time.Now()
	expiresAt := now.Add(time.Duration(ttlDays) * 24 * time.Hour)

	actorJSON, err := json.Marshal(dto.Actor.Metadata)
	if err != nil {
		return fmt.Errorf("marshaling actor metadata: %w", err)
	}

	eventJSON, err := json.Marshal(dto.Event.Metadata)
	if err != nil {
		return fmt.Errorf("marshaling event metadata: %w", err)
	}

	// ClickHouse batch mode: push to Redis stream for Node.js batch consumer.
	// Postgres mode: insert directly to database.
	isClickHouseBatchEnabled := h.config.ClickhouseAuditLogEnabled && h.config.IsClickHouseConfigured && h.keyStore != nil

	if isClickHouseBatchEnabled {
		// UUIDv7 embeds timestamp for time-ordered ClickHouse inserts
		id, err := uuid.NewV7()
		if err != nil {
			return fmt.Errorf("generating uuidv7: %w", err)
		}

		// ClickHouse format: empty strings instead of null
		projectID := ""
		if dto.ProjectID != nil {
			projectID = *dto.ProjectID
		}

		streamRecord := map[string]any{
			"id":            id.String(),
			"actor":         string(dto.Actor.Type),
			"actorMetadata": normalizeJSONPayload(dto.Actor.Metadata),
			"ipAddress":     dto.IPAddress,
			"eventType":     string(dto.Event.Type()),
			"eventMetadata": normalizeJSONPayload(dto.Event.Metadata),
			"userAgent":     dto.UserAgent,
			"userAgentType": dto.UserAgentType,
			"projectId":     projectID,
			"orgId":         orgID.String(),
			"expiresAt":     expiresAt,
			"createdAt":     now,
			"updatedAt":     now,
		}

		streamJSON, err := json.Marshal(streamRecord)
		if err != nil {
			return fmt.Errorf("marshaling stream record: %w", err)
		}

		if _, err := h.keyStore.StreamAdd(ctx, auditLogClickHouseStreamKey, "*", map[string]string{
			"data": string(streamJSON),
		}); err != nil {
			h.logger.ErrorContext(ctx, "failed to push audit log to Redis stream",
				slog.String("eventType", string(dto.Event.Type())),
				slog.Any("error", err),
			)
			return fmt.Errorf("pushing to redis stream: %w", err)
		}

		return nil
	}

	// Postgres mode
	var projectName sql.Null[string]
	if proj != nil {
		projectName = sql.Null[string]{V: proj.Name, Valid: true}
	}

	record := &AuditLogRecord{
		ID:            uuid.New(),
		Actor:         string(dto.Actor.Type),
		ActorMetadata: string(actorJSON),
		IPAddress:     toNullStr(dto.IPAddress),
		EventType:     string(dto.Event.Type()),
		EventMetadata: sql.Null[string]{V: string(eventJSON), Valid: true},
		UserAgent:     toNullStr(dto.UserAgent),
		UserAgentType: toNullStr(dto.UserAgentType),
		ExpiresAt:     sql.NullTime{Time: expiresAt, Valid: true},
		CreatedAt:     now,
		UpdatedAt:     now,
		OrgID:         sql.Null[uuid.UUID]{V: *orgID, Valid: true},
		ProjectID:     toNullStrPtr(dto.ProjectID),
		ProjectName:   projectName,
	}

	if !h.config.DisableAuditLogStorage {
		if err := h.createRecord(ctx, record); err != nil {
			h.logger.ErrorContext(ctx, "failed to insert audit log",
				slog.String("eventType", string(dto.Event.Type())),
				slog.Any("error", err),
			)
			return fmt.Errorf("inserting audit log: %w", err)
		}
	}

	return nil
}

func (h *QueueHandler) createRecord(ctx context.Context, record *AuditLogRecord) error {
	query := `
		INSERT INTO audit_logs (
			id, actor, "actorMetadata", "ipAddress", "eventType", "eventMetadata",
			"userAgent", "userAgentType", "expiresAt", "createdAt", "updatedAt",
			"orgId", "projectId", "projectName"
		) VALUES (
			@id, @actor, @actorMetadata, @ipAddress, @eventType, @eventMetadata,
			@userAgent, @userAgentType, @expiresAt, @createdAt, @updatedAt,
			@orgID, @projectID, @projectName
		)
	`
	args := pgx.NamedArgs{
		"id":            record.ID,
		"actor":         record.Actor,
		"actorMetadata": record.ActorMetadata,
		"ipAddress":     record.IPAddress,
		"eventType":     record.EventType,
		"eventMetadata": record.EventMetadata,
		"userAgent":     record.UserAgent,
		"userAgentType": record.UserAgentType,
		"expiresAt":     record.ExpiresAt,
		"createdAt":     record.CreatedAt,
		"updatedAt":     record.UpdatedAt,
		"orgID":         record.OrgID,
		"projectID":     record.ProjectID,
		"projectName":   record.ProjectName,
	}

	_, err := h.db.Primary().Exec(ctx, query, args)
	return err
}

func toNullStr(s string) sql.Null[string] {
	if s == "" {
		return sql.Null[string]{}
	}
	return sql.Null[string]{V: s, Valid: true}
}

func toNullStrPtr(s *string) sql.Null[string] {
	if s == nil || *s == "" {
		return sql.Null[string]{}
	}
	return sql.Null[string]{V: *s, Valid: true}
}
