package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/libs/requestid"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
	"github.com/jackc/pgx/v5"
	"google.golang.org/protobuf/proto"
)

type CreateKeyParams struct {
	Name                string
	KeyUsage            string
	OrgID               uuid.UUID
	IsReserved          bool
	IsExportable        bool
	HasDeleteProtection bool
	ProjectID           *uuid.UUID
	Description         *string
}

type CreateKeyResult struct {
	ID        uuid.UUID
	CreatedAt time.Time
	UpdatedAt time.Time
}

type UpdateKmsKeyParams struct {
	Name                *string
	IsDisabled          *bool
	Description         *string
	HasDeleteProtection *bool
}

type GetKeyResult struct {
	ID                          uuid.UUID
	Name                        string
	Description                 sql.Null[string]
	IsDisabled                  bool
	IsReserved                  bool
	OrgID                       uuid.UUID
	ProjectID                   sql.Null[uuid.UUID]
	KeyUsage                    string
	IsExportable                bool
	HasDeleteProtection         bool
	CreatedAt                   time.Time
	UpdatedAt                   time.Time
	InternalEncryptedKey        sql.Null[[]byte]
	InternalEncryptionAlgorithm sql.Null[string]
	ExternalKMSID               sql.Null[uuid.UUID]
	ExternalProvider            sql.Null[string]
	ExternalEncryptedInput      sql.Null[[]byte]
}

type KmsKeyMetaFieldsResult struct {
	ID                  uuid.UUID
	Name                string
	Description         sql.Null[string]
	IsDisabled          sql.Null[bool]
	IsReserved          sql.Null[bool]
	OrgID               uuid.UUID
	ProjectID           sql.Null[uuid.UUID]
	KeyUsage            string
	IsExportable        bool
	HasDeleteProtection bool
	UpdatedAt           time.Time
}

type KMSStore interface {
	CreateKey(ctx context.Context, params *CreateKeyParams, tx pgx.Tx) (*CreateKeyResult, error)
	GetKey(ctx context.Context, keyID uuid.UUID) (*GetKeyResult, error)
	FindValidationFieldsById(ctx context.Context, keyID uuid.UUID) (*KmsKeyMetaFieldsResult, error)
	DeleteKeyById(ctx context.Context, keyID string, tx pgx.Tx) (bool, error, func())
	UpdateKmsKey(ctx context.Context, keyID string, params *UpdateKmsKeyParams, tx pgx.Tx) (*KmsKeyMetaFieldsResult, error, func())
	GetSnapshot() ([]byte, error)
	RestoreSnapshot(data []byte) error
	SetRaftBridge(bridge KeyMetaRaftSyncHook)
	DisableCache()
	KeyMetaRaftCallback
}

func (s *kmsStore) FindValidationFieldsById(
	ctx context.Context,
	keyID uuid.UUID,
) (*KmsKeyMetaFieldsResult, error) {

	// try cache
	if cache := s.keyMetaCache(); cache != nil {
		value, ok := cache.Get(keyID)
		if ok {
			return value, nil
		}
	}

	const query = `
		SELECT
			id,
			name,
			description,
			"isDisabled",
			"isReserved",
			"orgId",
			"projectId",
			"keyUsage",
			"isExportable",
			"hasDeleteProtection",
			"updatedAt"
		FROM kms_keys
		WHERE id = @kmsKeyID
	`

	var result KmsKeyMetaFieldsResult
	if err := s.db.Replica().QueryRow(ctx, query, pgx.NamedArgs{"kmsKeyID": keyID}).Scan(
		&result.ID,
		&result.Name,
		&result.Description,
		&result.IsDisabled,
		&result.IsReserved,
		&result.OrgID,
		&result.ProjectID,
		&result.KeyUsage,
		&result.IsExportable,
		&result.HasDeleteProtection,
		&result.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errutil.NotFound("KMS key with ID %s not found", keyID)
		}
		return nil, errutil.DatabaseErr("Failed to find KMS key").WithErrf(
			"findValidationFieldsById(kmsKeyID=%s): %w",
			keyID,
			err,
		)
	}

	// update cache
	if cache := s.keyMetaCache(); cache != nil {
		cache.Add(keyID, &result)
	}

	return &result, nil
}

type kmsStore struct {
	cacheMu          sync.RWMutex
	db               pg.DB
	kmsMetaCache     *KeyMetaCache
	kmsMetaCacheRaft KeyMetaRaftSyncHook
}

func (s *kmsStore) keyMetaCache() *KeyMetaCache {
	s.cacheMu.RLock()
	defer s.cacheMu.RUnlock()
	return s.kmsMetaCache
}

func (s *kmsStore) raftBridge() KeyMetaRaftSyncHook {
	s.cacheMu.RLock()
	defer s.cacheMu.RUnlock()
	return s.kmsMetaCacheRaft
}

// GetSnapshot serializes the cached KMS-key metadata for Raft persistence.
func (s *kmsStore) GetSnapshot() ([]byte, error) {
	cache := s.keyMetaCache()
	if cache == nil {
		slog.Default().Debug("KMS cache snapshot requested", slog.Time("event_time", time.Now().UTC()), slog.Int("cache_entries", 0))
		return proto.Marshal(&kmsproto.KmsKeyMetadataSnapshot{})
	}
	keys := cache.Keys()
	slog.Default().Debug("cache", "KMS cache snapshot requested", slog.Time("event_time", time.Now().UTC()), slog.Int("cache_entries", len(keys)))
	entries := make([]*kmsproto.KmsKeyMetadata, 0, len(keys))
	for _, keyID := range keys {
		if entry, ok := cache.Peek(keyID); ok && entry != nil {
			metadata := &kmsproto.KmsKeyMetadata{
				Id:                  entry.ID.String(),
				Name:                entry.Name,
				OrgId:               entry.OrgID.String(),
				KeyUsage:            entry.KeyUsage,
				IsExportable:        entry.IsExportable,
				HasDeleteProtection: entry.HasDeleteProtection,
				UpdatedAtUnixNano:   entry.UpdatedAt.UnixNano(),
			}
			if entry.Description.Valid {
				metadata.Description = &entry.Description.V
			}
			if entry.IsDisabled.Valid {
				metadata.IsDisabled = &entry.IsDisabled.V
			}
			if entry.IsReserved.Valid {
				metadata.IsReserved = &entry.IsReserved.V
			}
			if entry.ProjectID.Valid {
				projectID := entry.ProjectID.V.String()
				metadata.ProjectId = &projectID
			}
			entries = append(entries, metadata)
		}
	}
	snapshot, err := proto.MarshalOptions{Deterministic: true}.Marshal(&kmsproto.KmsKeyMetadataSnapshot{Entries: entries})
	if err != nil {
		return nil, fmt.Errorf("marshal KMS key metadata cache: %w", err)
	}
	slog.Default().Debug("KMS cache snapshot created", slog.Time("event_time", time.Now().UTC()), slog.Int("cache_entries", len(entries)), slog.Int("snapshot_bytes", len(snapshot)))
	return snapshot, nil
}

// RestoreSnapshot replaces cached KMS-key metadata with a Raft snapshot.
func (s *kmsStore) RestoreSnapshot(data []byte) error {
	cache := s.keyMetaCache()
	if cache == nil {
		slog.Default().Debug("KMS cache snapshot restore skipped", slog.Time("event_time", time.Now().UTC()), slog.Int("snapshot_bytes", len(data)))
		return nil
	}
	slog.Default().Debug("cache", "KMS cache snapshot restore started", slog.Time("event_time", time.Now().UTC()), slog.Int("snapshot_bytes", len(data)))

	snapshot := new(kmsproto.KmsKeyMetadataSnapshot)
	if err := proto.Unmarshal(data, snapshot); err != nil {
		return fmt.Errorf("unmarshal KMS key metadata cache snapshot: %w", err)
	}

	entries := make([]KmsKeyMetaFieldsResult, 0, len(snapshot.GetEntries()))
	for _, metadata := range snapshot.GetEntries() {
		if metadata == nil {
			return fmt.Errorf("KMS key metadata cache snapshot contains an empty entry")
		}
		id, err := uuid.Parse(metadata.GetId())
		if err != nil {
			return fmt.Errorf("KMS key metadata cache snapshot contains an empty key ID")
		}
		orgID, err := uuid.Parse(metadata.GetOrgId())
		if err != nil {
			return fmt.Errorf("KMS key metadata cache snapshot contains an invalid organization ID")
		}
		entry := KmsKeyMetaFieldsResult{
			ID:                  id,
			Name:                metadata.GetName(),
			Description:         sql.Null[string]{V: metadata.GetDescription(), Valid: metadata.Description != nil},
			IsDisabled:          sql.Null[bool]{V: metadata.GetIsDisabled(), Valid: metadata.IsDisabled != nil},
			IsReserved:          sql.Null[bool]{V: metadata.GetIsReserved(), Valid: metadata.IsReserved != nil},
			OrgID:               orgID,
			KeyUsage:            metadata.GetKeyUsage(),
			IsExportable:        metadata.GetIsExportable(),
			HasDeleteProtection: metadata.GetHasDeleteProtection(),
			UpdatedAt:           time.Unix(0, metadata.GetUpdatedAtUnixNano()),
		}
		if metadata.ProjectId != nil {
			projectID, err := uuid.Parse(metadata.GetProjectId())
			if err != nil {
				return fmt.Errorf("KMS key metadata cache snapshot contains an invalid project ID")
			}
			entry.ProjectID = sql.Null[uuid.UUID]{V: projectID, Valid: true}
		}
		entries = append(entries, entry)
	}

	cache.Purge()
	for i := range entries {
		entry := entries[i]
		cache.Add(entry.ID, &entry)
	}
	slog.Default().Debug("KMS cache snapshot restored", slog.Time("event_time", time.Now().UTC()), slog.Int("cache_entries", len(entries)))
	return nil
}

// SetRaftBridge attaches Raft synchronization after the Raft node is ready.
func (s *kmsStore) SetRaftBridge(bridge KeyMetaRaftSyncHook) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	if s.kmsMetaCache == nil {
		return
	}
	s.kmsMetaCacheRaft = bridge
	slog.Default().Debug("KMS cache Raft bridge configured", slog.Time("event_time", time.Now().UTC()), slog.Bool("enabled", bridge != nil))
}

// DisableCache permanently disables the local KMS metadata cache for this process.
func (s *kmsStore) DisableCache() {
	s.cacheMu.Lock()
	cache := s.kmsMetaCache
	s.kmsMetaCache = nil
	s.kmsMetaCacheRaft = nil
	s.cacheMu.Unlock()

	if cache != nil {
		cache.Purge()
	}
}

// OnKeyDeleted implements [KMSStore].
func (s *kmsStore) OnKeyDeleted(keyID string, traceID string) {
	if cache := s.keyMetaCache(); cache == nil {
		if isBenchmarkTrace(traceID) {
			slog.Default().Debug("benchmark Raft cache deletion applied", slog.String("trace_id", traceID), slog.String("key_id", keyID), slog.Bool("cache_enabled", false))
		}
		return
	} else if parsedUUID, err := uuid.Parse(keyID); err == nil {
		cache.Remove(parsedUUID)
	}
	if isBenchmarkTrace(traceID) {
		slog.Default().Debug("benchmark Raft cache deletion applied", slog.String("trace_id", traceID), slog.String("key_id", keyID), slog.Bool("cache_enabled", true))
	}
}

// OnKeyUpdated implements [KMSStore].
func (s *kmsStore) OnKeyUpdated(payload *kmsproto.KeyUpdatedPayload, traceID string) {
	cache := s.keyMetaCache()
	if cache == nil {
		if isBenchmarkTrace(traceID) {
			slog.Default().Debug("benchmark Raft cache update applied", slog.String("trace_id", traceID), slog.Bool("cache_enabled", false), slog.Bool("cache_updated", false))
		}
		return
	}
	if payload == nil {
		return
	}
	parsedUUID, err := uuid.Parse(payload.GetKeyId())
	if err != nil {
		return
	}
	updatedAt := time.Unix(0, payload.GetUpdatedAtUnixNano())

	keyMeta, ok := cache.Get(parsedUUID)
	cacheUpdated := ok && keyMeta.UpdatedAt.Before(updatedAt)
	if cacheUpdated {
		keyMeta.Name = payload.GetName()
		keyMeta.IsDisabled = sql.Null[bool]{Valid: true, V: payload.GetIsDisabled()}
		keyMeta.Description = sql.Null[string]{Valid: true, V: payload.GetDescription()}
		keyMeta.HasDeleteProtection = payload.GetHasDeleteProtection()
		keyMeta.UpdatedAt = updatedAt
		cache.Add(parsedUUID, keyMeta)
	}
	if isBenchmarkTrace(traceID) {
		slog.Default().Debug("benchmark Raft cache update applied", slog.String("trace_id", traceID), slog.String("key_id", payload.GetKeyId()), slog.Bool("cache_enabled", true), slog.Bool("cache_present", ok), slog.Bool("cache_updated", cacheUpdated))
	}
}

type KmsStoreOptions struct {
	KmsMetaCache     *KeyMetaCache
	KmsMetaCacheRaft KeyMetaRaftSyncHook
}

func NewKMSStore(db pg.DB, opts *KmsStoreOptions) KMSStore {
	return &kmsStore{
		db:               db,
		kmsMetaCache:     opts.KmsMetaCache,
		kmsMetaCacheRaft: opts.KmsMetaCacheRaft,
	}
}

func (s *kmsStore) GetKey(ctx context.Context, keyID uuid.UUID) (*GetKeyResult, error) {
	query := `
		SELECT
			kmsKey.id,
			kmsKey.name,
			kmsKey.description,
			kmsKey."isDisabled",
			kmsKey."isReserved",
			kmsKey."orgId",
			kmsKey."projectId",
			kmsKey."keyUsage",
			kmsKey."isExportable",
			kmsKey."hasDeleteProtection",
			kmsKey."createdAt",
			kmsKey."updatedAt",
			internalKms."encryptedKey",
			internalKms."encryptionAlgorithm",
			externalKms.id AS external_kms_id,
			externalKms.provider,
			externalKms."encryptedProviderInputs"
		FROM kms_keys kmsKey
		LEFT JOIN internal_kms internalKms ON internalKms."kmsKeyId" = kmsKey.id
		LEFT JOIN external_kms externalKms ON externalKms."kmsKeyId" = kmsKey.id
		WHERE kmsKey.id = @kmsKeyID
	`
	row := s.db.Replica().QueryRow(ctx, query, pgx.NamedArgs{"kmsKeyID": keyID})

	var result GetKeyResult
	if err := row.Scan(
		&result.ID,
		&result.Name,
		&result.Description,
		&result.IsDisabled,
		&result.IsReserved,
		&result.OrgID,
		&result.ProjectID,
		&result.KeyUsage,
		&result.IsExportable,
		&result.HasDeleteProtection,
		&result.CreatedAt,
		&result.UpdatedAt,
		&result.InternalEncryptedKey,
		&result.InternalEncryptionAlgorithm,
		&result.ExternalKMSID,
		&result.ExternalProvider,
		&result.ExternalEncryptedInput,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errutil.NotFound("KMS key with ID %s not found", keyID)
		}
		return nil, errutil.DatabaseErr("Failed to find KMS key").WithErrf("getKey(kmsKeyID=%s): %w", keyID, err)
	}

	return &result, nil
}

func (s *kmsStore) UpdateKmsKey(ctx context.Context, keyID string, params *UpdateKmsKeyParams, tx pgx.Tx) (*KmsKeyMetaFieldsResult, error, func()) {
	if params == nil || (params.Name == nil && params.IsDisabled == nil && params.Description == nil && params.HasDeleteProtection == nil) {
		return nil, fmt.Errorf("at least one KMS key field is required"), nil
	}

	sets := make([]string, 0, 4)
	args := pgx.NamedArgs{"keyID": keyID}
	if params.Name != nil {
		sets = append(sets, `name = @name`)
		args["name"] = *params.Name
	}
	if params.IsDisabled != nil {
		sets = append(sets, `"isDisabled" = @isDisabled`)
		args["isDisabled"] = *params.IsDisabled
	}
	if params.Description != nil {
		sets = append(sets, `description = @description`)
		args["description"] = *params.Description
	}
	if params.HasDeleteProtection != nil {
		sets = append(sets, `"hasDeleteProtection" = @hasDeleteProtection`)
		args["hasDeleteProtection"] = *params.HasDeleteProtection
	}
	// todo: does compiles store the append operation strings in heap or stack here ?
	// if stays in stack , it moves to heap at query operation below ? , declare these variables as struct constants to allocate in heap ?

	query := fmt.Sprintf(`
		UPDATE kms_keys
		SET %s, "updatedAt" = NOW()
		WHERE id = @keyID
		RETURNING id, name, description, "isDisabled", "isReserved", "orgId", "projectId", "keyUsage", "isExportable", "hasDeleteProtection", "updatedAt"
	`, strings.Join(sets, ", "))

	var result KmsKeyMetaFieldsResult
	if err := tx.QueryRow(ctx, query, args).Scan(
		&result.ID, &result.Name, &result.Description, &result.IsDisabled, &result.IsReserved,
		&result.OrgID, &result.ProjectID, &result.KeyUsage, &result.IsExportable,
		&result.HasDeleteProtection, &result.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errutil.NotFound("KMS key with ID %s not found", keyID), nil
		}
		return nil, errutil.DatabaseErr("Failed to update KMS key").WithErrf("updateKmsKey(kmsKeyID=%s): %w", keyID, err), nil
	}

	var onCommit func()
	if s.keyMetaCache() != nil {
		traceID := requestid.FromContext(ctx)
		onCommit = func() {
			description := ""
			if result.Description.Valid {
				description = result.Description.V
			}
			payload := &kmsproto.KeyUpdatedPayload{
				KeyId: result.ID.String(), Name: result.Name, IsDisabled: result.IsDisabled.V, Description: description,
				HasDeleteProtection: result.HasDeleteProtection, UpdatedAtUnixNano: result.UpdatedAt.UnixNano(),
			}
			// sync to node cache
			s.OnKeyUpdated(payload, traceID)

			if raftBridge := s.raftBridge(); raftBridge != nil {
				// sync across nodes
				raftBridge.HookKeyUpdated(payload, traceID)
			}
		}
	}

	return &result, nil, onCommit
}

func (s *kmsStore) CreateKey(
	ctx context.Context,
	params *CreateKeyParams,
	tx pgx.Tx,
) (*CreateKeyResult, error) {

	const insertKeyQuery = `
		INSERT INTO kms_keys (
			name,
			"keyUsage",
			"orgId",
			"isReserved",
			"isExportable",
			"hasDeleteProtection",
			"projectId",
			description
		)
		VALUES (
			@name,
			@keyUsage,
			@orgID,
			@isReserved,
			@isExportable,
			@hasDeleteProtection,
			@projectID,
			@description
		)
		RETURNING id, "createdAt", "updatedAt"
	`

	keyArgs := pgx.NamedArgs{
		"name":                params.Name,
		"keyUsage":            params.KeyUsage,
		"orgID":               params.OrgID,
		"isReserved":          params.IsReserved,
		"isExportable":        params.IsExportable,
		"hasDeleteProtection": params.HasDeleteProtection,
		"projectID":           params.ProjectID,
		"description":         params.Description,
	}

	var result CreateKeyResult

	if err := tx.QueryRow(ctx, insertKeyQuery, keyArgs).Scan(&result.ID, &result.CreatedAt, &result.UpdatedAt); err != nil {
		return nil, fmt.Errorf("inserting kms_keys: %w", err)
	}

	return &result, nil
}

func (s *kmsStore) DeleteKeyById(
	ctx context.Context,
	keyID string,
	tx pgx.Tx,
) (success bool, err error, onCommit func()) {

	const query = `
		DELETE FROM kms_keys
		WHERE id = @kmsKeyID
	`

	result, err := tx.Exec(ctx, query, pgx.NamedArgs{"kmsKeyID": keyID})

	if err != nil {
		return false, fmt.Errorf("deleting kms_keys(kmsKeyID=%s): %w", keyID, err), onCommit
	}

	if s.keyMetaCache() != nil {
		traceID := requestid.FromContext(ctx)
		onCommit = func() {
			// evict from cache
			s.OnKeyDeleted(keyID, traceID)
			if raftBridge := s.raftBridge(); raftBridge != nil {
				// sync across nodes
				raftBridge.HookKeyDeleted(keyID, traceID)
			}
		}
	}

	return result.RowsAffected() > 0, nil, onCommit
}
