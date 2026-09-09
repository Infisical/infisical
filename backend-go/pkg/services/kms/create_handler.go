package kms

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/infisical/api/internal/libs/crypto/cipher"
	"github.com/infisical/api/internal/libs/crypto/sign"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/pkg/lib/hmac"
	"github.com/infisical/api/pkg/services/kms/db/store"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"

	"github.com/jackc/pgx/v5"
)

var supportedKeyUsageMap = map[string]KmsKeyUsage{
	// Encrypt / Decrypt
	string(AESGCM256): EncryptDecrypt,
	string(AESGCM128): EncryptDecrypt,

	// Sign / Verify
	string(sign.RSA4096): SignVerify,
	string(sign.ECCP256): SignVerify,
	string(sign.ECCP384): SignVerify,
	string(sign.ECCP521): SignVerify,
	string(sign.MLDSA44): SignVerify,
	string(sign.MLDSA65): SignVerify,
	string(sign.MLDSA87): SignVerify,

	// Generate / Verify MAC
	string(hmac.HMACSHA1):   GenerateVerifyMAC,
	string(hmac.HMACSHA224): GenerateVerifyMAC,
	string(hmac.HMACSHA256): GenerateVerifyMAC,
	string(hmac.HMACSHA384): GenerateVerifyMAC,
	string(hmac.HMACSHA512): GenerateVerifyMAC,
}

func verifyKeyTypeAndAlgorithm(
	keyUsage KmsKeyUsage,
	algorithm string,
	mandateKeyUsage *KmsKeyUsage,
) *errutil.Error {
	expectedUsage, ok := supportedKeyUsageMap[algorithm]
	if !ok {
		return errutil.BadRequest("unsupported algorithm: %s", algorithm)
	}

	if expectedUsage != keyUsage {
		return errutil.BadRequest(
			"unsupported algorithm %s for key usage %s",
			algorithm,
			keyUsage,
		)
	}

	if mandateKeyUsage != nil {
		if keyUsage != *mandateKeyUsage {
			return errutil.BadRequest(
				"unsupported operation for given key usage type %s", keyUsage,
			)
		}
	}

	return nil
}

func (s *Service) createKmsKey(ctx context.Context, req *kmsproto.CreateKmsKeyRequest, tx pgx.Tx) (*kmsproto.CreateKmsKeyResponse, error) {
	if req == nil || req.OrgId == "" || req.ProjectId == "" || req.KeyUsage == nil || req.Algorithm == nil {
		return nil, errutil.BadRequest("missing required parameters: orgId, projectId, keyUsage, and algorithm").EncError()
	}
	orgID, err := uuid.Parse(req.GetOrgId())
	if err != nil {
		return nil, errutil.BadRequest("invalid orgId: %s", req.GetOrgId()).EncError()
	}
	projectID, err := uuid.Parse(req.GetProjectId())
	if err != nil {
		return nil, errutil.BadRequest("invalid projectId: %s", req.GetProjectId()).EncError()
	}
	if err := verifyKeyTypeAndAlgorithm(KmsKeyUsage(req.GetKeyUsage()), req.GetAlgorithm(), nil); err != nil {
		return nil, err.EncError()
	}

	var keyMaterial []byte

	switch KmsKeyUsage(req.GetKeyUsage()) {
	case EncryptDecrypt:
		keyMaterial, err = cipher.GenerateKeyMaterial(cipher.SymmetricKeyAlgorithm(*req.Algorithm))
	case SignVerify:
		keyMaterial, err = sign.GeneratePrivateKey(sign.AsymmetricKeyAlgorithm(*req.Algorithm))
	case GenerateVerifyMAC:
		keyMaterial, err = hmac.GenerateKeyMaterial(hmac.HmacAlgorithm(*req.Algorithm))
	}

	if err != nil {
		return nil, errutil.CryptographicErr("Failed to create key material for algorithm").WithErr(err).EncError()
	}

	encodedKeyMaterial, err := cipher.SymmetricEncrypt(keyMaterial, []byte(s.rootEncryptionKey))
	if err != nil {
		return nil, errutil.CryptographicErr("Failed to encrypt key material").WithErr(err).EncError()
	}

	ownedTx := tx == nil
	if tx == nil {
		tx, err = s.db.Primary().Begin(ctx)
		if err != nil {
			return nil, errutil.InternalServer("Failed to begin KMS key transaction").WithErr(err).EncError()
		}
		defer tx.Rollback(ctx) // rollback is a no-op after commit
	}

	isExportable := req.GetIsExportable()
	hasDeleteProtection := req.GetHasDeleteProtection()
	encryptionAlgorithm := req.GetEncryptionAlgorithm()
	if encryptionAlgorithm == "" {
		encryptionAlgorithm = string(AESGCM256)
	}

	kmsResult, err := s.KmsStore.CreateKey(ctx, &store.CreateKeyParams{
		Name:                req.Name,
		KeyUsage:            *req.KeyUsage,
		OrgID:               orgID,
		IsReserved:          false,
		IsExportable:        isExportable,
		HasDeleteProtection: hasDeleteProtection,
		Description:         req.Description,
		ProjectID:           &projectID,
	}, tx)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to create KMS key").WithErr(err).EncError()
	}

	_, err = s.kmsInternalStore.Create(ctx, &store.CreateInternalKMSParams{
		Version:             1,
		EncryptedKey:        encodedKeyMaterial,
		EncryptionAlgorithm: encryptionAlgorithm,
		KMSKeyID:            kmsResult.ID,
	}, tx)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to create internal KMS key material").WithErr(err).EncError()
	}

	if ownedTx {
		if err := tx.Commit(ctx); err != nil {
			return nil, errutil.InternalServer("committing KMS key transaction").WithErr(err).EncError()
		}
	}

	return &kmsproto.CreateKmsKeyResponse{
		KeyId:     kmsResult.ID.String(),
		CreatedAt: kmsResult.CreatedAt.UTC().Format(time.RFC3339Nano),
		UpdatedAt: kmsResult.UpdatedAt.UTC().Format(time.RFC3339Nano),
	}, nil

}

// todo : migrate to use createKmsKey with overrides
// createKmsKeyWithInternal inserts a kms_keys row and its internal_kms material within a transaction.
func (s *Service) createKmsKeyWithInternal(ctx context.Context, tx pgx.Tx, orgID uuid.UUID, encryptedKey []byte) (uuid.UUID, error) {
	keyName := generateRandomKeyName()

	// Insert kms_keys
	insertKeyQuery := `
		INSERT INTO kms_keys (name, "orgId", "isReserved", "keyUsage")
		VALUES (@name, @orgID, true, 'encrypt-decrypt')
		RETURNING id
	`
	keyArgs := pgx.NamedArgs{
		"name":  keyName,
		"orgID": orgID,
	}

	var kmsKeyID uuid.UUID
	err := tx.QueryRow(ctx, insertKeyQuery, keyArgs).Scan(&kmsKeyID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("inserting kms_keys: %w", err)
	}

	// Insert internal_kms
	insertInternalQuery := `
		INSERT INTO internal_kms ("encryptedKey", "encryptionAlgorithm", version, "kmsKeyId")
		VALUES (@encryptedKey, 'aes-256-gcm', 1, @kmsKeyID)
	`
	internalArgs := pgx.NamedArgs{
		"encryptedKey": encryptedKey,
		"kmsKeyID":     kmsKeyID,
	}

	if _, err := tx.Exec(ctx, insertInternalQuery, internalArgs); err != nil {
		return uuid.Nil, fmt.Errorf("inserting internal_kms: %w", err)
	}

	return kmsKeyID, nil
}

func (s *Service) findOrCreateRootConfig(ctx context.Context, hsmConfigured bool, strategy RootKeyEncryptionStrategy) (*kmsRootConfigRow, error) {
	tx, err := s.db.Primary().Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback is no-op after commit

	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", PgLockKmsRootKeyInit); err != nil {
		return nil, fmt.Errorf("acquiring advisory lock: %w", err)
	}

	query := `SELECT id, "encryptedRootKey", "encryptionStrategy" FROM kms_root_config WHERE id = @id`
	row := tx.QueryRow(ctx, query, pgx.NamedArgs{"id": KmsRootConfigUUID})

	var existing kmsRootConfigRow
	err = row.Scan(&existing.ID, &existing.EncryptedRootKey, &existing.EncryptionStrategy)
	if err == nil {
		if cerr := tx.Commit(ctx); cerr != nil {
			return nil, fmt.Errorf("committing root config read: %w", cerr)
		}
		return &existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("checking existing root config: %w", err)
	}

	// Generate new root key
	var newRootKey []byte
	if hsmConfigured && s.hsm != nil {
		newRootKey, err = s.hsm.RandomBytes(32)
		if err != nil {
			return nil, fmt.Errorf("generating root key with HSM: %w", err)
		}
	} else {
		// todo : [32]byte pool optmization
		newRootKey = make([]byte, 32)
		if _, err := rand.Read(newRootKey); err != nil {
			return nil, fmt.Errorf("generating root key: %w", err)
		}
	}

	encryptedRootKey, err := s.encryptRootKey(newRootKey, strategy)
	if err != nil {
		return nil, fmt.Errorf("encrypting new root key: %w", err)
	}

	insertQuery := `
		INSERT INTO kms_root_config (id, "encryptedRootKey", "encryptionStrategy")
		VALUES (@id, @encryptedRootKey, @encryptionStrategy)
		RETURNING id, "encryptedRootKey", "encryptionStrategy"
	`
	insertArgs := pgx.NamedArgs{
		"id":                 KmsRootConfigUUID,
		"encryptedRootKey":   encryptedRootKey,
		"encryptionStrategy": string(strategy),
	}

	var result kmsRootConfigRow
	if err := tx.QueryRow(ctx, insertQuery, insertArgs).Scan(&result.ID, &result.EncryptedRootKey, &result.EncryptionStrategy); err != nil {
		return nil, fmt.Errorf("creating root config: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing transaction: %w", err)
	}

	return &result, nil
}
