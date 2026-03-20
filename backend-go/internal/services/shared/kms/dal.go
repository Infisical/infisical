package kms

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"
	"github.com/google/uuid"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/database/pg/gen/model"
	"github.com/infisical/api/internal/database/pg/gen/table"
	"github.com/infisical/api/internal/keystore"
)

// dalLockStore provides advisory locking for the DAL.
type dalLockStore interface {
	AcquirePgLock(ctx context.Context, lockID string, tx keystore.Tx) (*keystore.Lock, error)
}

// KmsKeyWithAssociatedKms is the join result of kms_keys LEFT JOIN internal_kms LEFT JOIN external_kms.
// Exactly one of InternalKms or ExternalKms will be non-nil.
type KmsKeyWithAssociatedKms struct {
	model.KmsKeys

	InternalKms *model.InternalKms
	ExternalKms *model.ExternalKms
}

// OrgKmsInfo holds the narrow org fields needed by the KMS service.
type OrgKmsInfo struct {
	ID                  uuid.UUID           `alias:"organizations.id"`
	KmsDefaultKeyId     sql.Null[uuid.UUID] `alias:"organizations.kmsDefaultKeyId"`
	KmsEncryptedDataKey *[]byte             `alias:"organizations.kmsEncryptedDataKey"`
}

// ProjectKmsInfo holds the narrow project fields needed by the KMS service.
type ProjectKmsInfo struct {
	ID                               string              `alias:"projects.id"`
	OrgId                            uuid.UUID           `alias:"projects.orgId"`
	KmsSecretManagerKeyId            sql.Null[uuid.UUID] `alias:"projects.kmsSecretManagerKeyId"`
	KmsSecretManagerEncryptedDataKey *[]byte             `alias:"projects.kmsSecretManagerEncryptedDataKey"`
}

// DAL handles all KMS-related database operations across
// kms_root_config, kms_keys, internal_kms, organizations, and projects.
type DAL struct {
	db        pg.DB
	lockStore dalLockStore
}

// NewDAL creates a new KMS DAL.
func NewDAL(db pg.DB, lockStore dalLockStore) *DAL {
	return &DAL{db: db, lockStore: lockStore}
}

// --- Root config ---

// FindOrCreateRootConfig atomically ensures the KMS root config row exists.
// Acquires a PG advisory lock, checks for an existing row, and calls createFn only
// when no config exists (avoiding unnecessary key generation on the hot path).
func (d *DAL) FindOrCreateRootConfig(ctx context.Context, createFn func() (encryptedRootKey []byte, encryptionStrategy string, err error)) (*model.KmsRootConfig, error) {
	tx, err := d.db.Primary().BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("beginning transaction: %w", err)
	}

	if _, err := tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock($1)", PgLockKmsRootKeyInit); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("acquiring advisory lock: %w", err)
	}

	// Check if root config already exists.
	var existing model.KmsRootConfig
	err = table.KmsRootConfig.
		SELECT(table.KmsRootConfig.AllColumns).
		WHERE(table.KmsRootConfig.ID.EQ(postgres.UUID(KmsRootConfigUUID))).
		QueryContext(ctx, tx, &existing)
	if err == nil {
		tx.Commit()
		return &existing, nil
	}
	if err != qrm.ErrNoRows {
		tx.Rollback()
		return nil, fmt.Errorf("checking existing root config: %w", err)
	}

	// Config doesn't exist — invoke callback to generate the new root key.
	encryptionRootKey, encryptionStrategy, err := createFn()
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("generating root config: %w", err)
	}

	// Create the initial root config row.
	var result model.KmsRootConfig
	err = table.KmsRootConfig.
		INSERT(table.KmsRootConfig.ID, table.KmsRootConfig.EncryptedRootKey, table.KmsRootConfig.EncryptionStrategy).
		MODEL(model.KmsRootConfig{
			ID:                 KmsRootConfigUUID,
			EncryptedRootKey:   encryptionRootKey,
			EncryptionStrategy: sql.Null[string]{V: encryptionStrategy, Valid: true},
		}).
		RETURNING(table.KmsRootConfig.AllColumns).
		QueryContext(ctx, tx, &result)
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("creating root config: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("committing transaction: %w", err)
	}

	return &result, nil
}

// --- Organization KMS key ---

// FindOrCreateOrgKmsKey atomically ensures the org has a default KMS key.
// Acquires an advisory lock, checks for an existing key, and calls createFn only
// when no key exists. createFn should return the encrypted key material.
func (d *DAL) FindOrCreateOrgKmsKey(ctx context.Context, orgID uuid.UUID, createFn func() (encryptedKey []byte, err error)) (uuid.UUID, error) {
	lock, err := d.lockStore.AcquirePgLock(ctx, fmt.Sprintf("kms-org-key:%s", orgID), nil)
	if err != nil {
		return uuid.Nil, fmt.Errorf("acquiring org key lock: %w", err)
	}
	defer lock.Rollback()

	tx := lock.Tx()

	// Re-check after lock — another request may have created it.
	org, err := d.findOrgKmsInfo(ctx, tx, orgID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("finding org: %w", err)
	}
	if org.KmsDefaultKeyId.Valid {
		if err := lock.Release(); err != nil {
			return uuid.Nil, err
		}
		return org.KmsDefaultKeyId.V, nil
	}

	encryptedKey, err := createFn()
	if err != nil {
		return uuid.Nil, fmt.Errorf("generating KMS key: %w", err)
	}

	createdID, err := d.CreateKmsKeyWithInternal(ctx, tx,
		model.KmsKeys{
			Name:       generateRandomKeyName(),
			OrgId:      org.ID,
			IsReserved: sql.Null[bool]{V: true, Valid: true},
			KeyUsage:   "encrypt-decrypt",
		},
		model.InternalKms{
			EncryptedKey:        encryptedKey,
			EncryptionAlgorithm: "aes-256-gcm",
			Version:             1,
		},
	)
	if err != nil {
		return uuid.Nil, err
	}

	if _, err := table.Organizations.
		UPDATE(table.Organizations.KmsDefaultKeyId).
		SET(createdID.String()).
		WHERE(table.Organizations.ID.EQ(postgres.UUID(orgID))).
		ExecContext(ctx, tx); err != nil {
		return uuid.Nil, fmt.Errorf("updating org default key: %w", err)
	}

	if err := lock.Release(); err != nil {
		return uuid.Nil, err
	}
	return createdID, nil
}

// --- Organization data key ---

// FindOrCreateOrgDataKey atomically ensures the org has an encrypted data key.
// Acquires an advisory lock, checks for an existing key, and calls createFn only
// when no key exists. createFn should return the encrypted data key.
// Returns the encrypted data key (existing or newly created).
//
// The caller must ensure the org's KMS key exists before calling this
// to avoid deadlocks with concurrent KMS key + data key creation.
func (d *DAL) FindOrCreateOrgDataKey(ctx context.Context, orgID uuid.UUID, createFn func() (encryptedDataKey []byte, err error)) ([]byte, error) {
	lock, err := d.lockStore.AcquirePgLock(ctx, fmt.Sprintf("kms-org-data-key:%s", orgID), nil)
	if err != nil {
		return nil, fmt.Errorf("acquiring org data key lock: %w", err)
	}
	defer lock.Rollback()

	tx := lock.Tx()

	// Re-check after lock — another request may have created it.
	org, err := d.findOrgKmsInfo(ctx, tx, orgID)
	if err != nil {
		return nil, fmt.Errorf("finding org: %w", err)
	}
	if org.KmsEncryptedDataKey != nil {
		if err := lock.Release(); err != nil {
			return nil, err
		}
		return *org.KmsEncryptedDataKey, nil
	}

	encryptedDataKey, err := createFn()
	if err != nil {
		return nil, fmt.Errorf("generating data key: %w", err)
	}

	if _, err := table.Organizations.
		UPDATE(table.Organizations.KmsEncryptedDataKey).
		SET(encryptedDataKey).
		WHERE(table.Organizations.ID.EQ(postgres.UUID(orgID))).
		ExecContext(ctx, tx); err != nil {
		return nil, fmt.Errorf("setting org encrypted data key: %w", err)
	}

	if err := lock.Release(); err != nil {
		return nil, err
	}
	return encryptedDataKey, nil
}

// --- KMS key reads ---

// FindKmsKeyByID loads a kms_keys row with its associated internal or external KMS material.
func (d *DAL) FindKmsKeyByID(ctx context.Context, kmsKeyID uuid.UUID) (*KmsKeyWithAssociatedKms, error) {
	var result KmsKeyWithAssociatedKms

	err := table.KmsKeys.
		LEFT_JOIN(table.InternalKms, table.InternalKms.KmsKeyId.EQ(table.KmsKeys.ID)).
		LEFT_JOIN(table.ExternalKms, table.ExternalKms.KmsKeyId.EQ(table.KmsKeys.ID)).
		SELECT(table.KmsKeys.AllColumns, table.InternalKms.AllColumns, table.ExternalKms.AllColumns).
		WHERE(table.KmsKeys.ID.EQ(postgres.UUID(kmsKeyID))).
		QueryContext(ctx, d.db.Replica(), &result)
	if err != nil {
		return nil, fmt.Errorf("finding KMS key: %w", err)
	}

	return &result, nil
}

// --- KMS key creation ---

// CreateKmsKeyWithInternal inserts a kms_keys row and its internal_kms material within a transaction.
// Returns the generated kms_keys.id.
func (d *DAL) CreateKmsKeyWithInternal(ctx context.Context, tx pg.Tx, kmsKey model.KmsKeys, internalKms model.InternalKms) (uuid.UUID, error) {
	var kmsKeyResult model.KmsKeys
	err := table.KmsKeys.
		INSERT(table.KmsKeys.Name, table.KmsKeys.OrgId, table.KmsKeys.IsReserved, table.KmsKeys.KeyUsage).
		MODEL(kmsKey).
		RETURNING(table.KmsKeys.AllColumns).
		QueryContext(ctx, tx, &kmsKeyResult)
	if err != nil {
		return uuid.Nil, fmt.Errorf("inserting kms_keys: %w", err)
	}

	// Link internal_kms to the created kms_keys row.
	internalKms.KmsKeyId = kmsKeyResult.ID
	var internalResult model.InternalKms
	err = table.InternalKms.
		INSERT(table.InternalKms.EncryptedKey, table.InternalKms.EncryptionAlgorithm, table.InternalKms.Version, table.InternalKms.KmsKeyId).
		MODEL(internalKms).
		RETURNING(table.InternalKms.AllColumns).
		QueryContext(ctx, tx, &internalResult)
	if err != nil {
		return uuid.Nil, fmt.Errorf("inserting internal_kms: %w", err)
	}

	return kmsKeyResult.ID, nil
}

// --- Organization reads ---

// FindOrgKmsInfo returns the narrow org fields needed for KMS data key operations.
func (d *DAL) FindOrgKmsInfo(ctx context.Context, orgID uuid.UUID) (*OrgKmsInfo, error) {
	return d.findOrgKmsInfo(ctx, d.db.Replica(), orgID)
}

func (d *DAL) findOrgKmsInfo(ctx context.Context, db qrm.DB, orgID uuid.UUID) (*OrgKmsInfo, error) {
	var result OrgKmsInfo

	err := table.Organizations.
		SELECT(
			table.Organizations.ID,
			table.Organizations.KmsDefaultKeyId,
			table.Organizations.KmsEncryptedDataKey,
		).
		WHERE(table.Organizations.ID.EQ(postgres.UUID(orgID))).
		QueryContext(ctx, db, &result)
	if err != nil {
		return nil, fmt.Errorf("finding org KMS info: %w", err)
	}

	return &result, nil
}

// --- Project KMS key ---

// FindOrCreateProjectKmsKey atomically ensures the project has a secret manager KMS key.
// Acquires an advisory lock, checks for an existing key, and calls createFn only
// when no key exists. createFn should return the encrypted key material.
func (d *DAL) FindOrCreateProjectKmsKey(ctx context.Context, projectID string, createFn func() (encryptedKey []byte, err error)) (uuid.UUID, error) {
	lock, err := d.lockStore.AcquirePgLock(ctx, fmt.Sprintf("kms-project-key:%s", projectID), nil)
	if err != nil {
		return uuid.Nil, fmt.Errorf("acquiring project key lock: %w", err)
	}
	defer lock.Rollback()

	tx := lock.Tx()

	// Re-check after lock — another request may have created it.
	project, err := d.findProjectKmsInfo(ctx, tx, projectID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("finding project: %w", err)
	}
	if project.KmsSecretManagerKeyId.Valid {
		if err := lock.Release(); err != nil {
			return uuid.Nil, err
		}
		return project.KmsSecretManagerKeyId.V, nil
	}

	encryptedKey, err := createFn()
	if err != nil {
		return uuid.Nil, fmt.Errorf("generating KMS key: %w", err)
	}

	createdID, err := d.CreateKmsKeyWithInternal(ctx, tx,
		model.KmsKeys{
			Name:       generateRandomKeyName(),
			OrgId:      project.OrgId,
			IsReserved: sql.Null[bool]{V: true, Valid: true},
			KeyUsage:   "encrypt-decrypt",
		},
		model.InternalKms{
			EncryptedKey:        encryptedKey,
			EncryptionAlgorithm: "aes-256-gcm",
			Version:             1,
		},
	)
	if err != nil {
		return uuid.Nil, err
	}

	if _, err := table.Projects.
		UPDATE(table.Projects.KmsSecretManagerKeyId).
		SET(createdID.String()).
		WHERE(table.Projects.ID.EQ(postgres.String(projectID))).
		ExecContext(ctx, tx); err != nil {
		return uuid.Nil, fmt.Errorf("updating project KMS key: %w", err)
	}

	if err := lock.Release(); err != nil {
		return uuid.Nil, err
	}
	return createdID, nil
}

// --- Project data key ---

// FindOrCreateProjectDataKey atomically ensures the project has an encrypted data key.
// Acquires an advisory lock, checks for an existing key, and calls createFn only
// when no key exists. createFn should return the encrypted data key.
// Returns the encrypted data key (existing or newly created).
//
// The caller must ensure the project's KMS key exists before calling this
// to avoid deadlocks with concurrent KMS key + data key creation.
func (d *DAL) FindOrCreateProjectDataKey(ctx context.Context, projectID string, createFn func() (encryptedDataKey []byte, err error)) ([]byte, error) {
	lock, err := d.lockStore.AcquirePgLock(ctx, fmt.Sprintf("kms-project-data-key:%s", projectID), nil)
	if err != nil {
		return nil, fmt.Errorf("acquiring project data key lock: %w", err)
	}
	defer lock.Rollback()

	tx := lock.Tx()

	// Re-check after lock — another request may have created it.
	project, err := d.findProjectKmsInfo(ctx, tx, projectID)
	if err != nil {
		return nil, fmt.Errorf("finding project: %w", err)
	}
	if project.KmsSecretManagerEncryptedDataKey != nil {
		if err := lock.Release(); err != nil {
			return nil, err
		}
		return *project.KmsSecretManagerEncryptedDataKey, nil
	}

	encryptedDataKey, err := createFn()
	if err != nil {
		return nil, fmt.Errorf("generating data key: %w", err)
	}

	if _, err := table.Projects.
		UPDATE(table.Projects.KmsSecretManagerEncryptedDataKey).
		SET(encryptedDataKey).
		WHERE(table.Projects.ID.EQ(postgres.String(projectID))).
		ExecContext(ctx, tx); err != nil {
		return nil, fmt.Errorf("setting project encrypted data key: %w", err)
	}

	if err := lock.Release(); err != nil {
		return nil, err
	}
	return encryptedDataKey, nil
}

// --- Project reads ---

// FindProjectKmsInfo returns the narrow project fields needed for KMS data key operations.
func (d *DAL) FindProjectKmsInfo(ctx context.Context, projectID string) (*ProjectKmsInfo, error) {
	return d.findProjectKmsInfo(ctx, d.db.Replica(), projectID)
}

func (d *DAL) findProjectKmsInfo(ctx context.Context, db qrm.DB, projectID string) (*ProjectKmsInfo, error) {
	var result ProjectKmsInfo

	err := table.Projects.
		SELECT(
			table.Projects.ID,
			table.Projects.OrgId,
			table.Projects.KmsSecretManagerKeyId,
			table.Projects.KmsSecretManagerEncryptedDataKey,
		).
		WHERE(table.Projects.ID.EQ(postgres.String(projectID))).
		QueryContext(ctx, db, &result)
	if err != nil {
		return nil, fmt.Errorf("finding project KMS info: %w", err)
	}

	return &result, nil
}
