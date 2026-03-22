package kms

import (
	"context"
	"crypto/rand"
	"fmt"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
)

func (s *SharedService) getOrgDataKey(ctx context.Context, orgID uuid.UUID) ([]byte, error) {
	org, err := s.dal.FindOrgKmsInfo(ctx, orgID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find organization KMS info").WithErr(err)
	}

	// Ensure org has a KMS key (lazy create if missing).
	kmsKeyID := org.KmsDefaultKeyId
	if !kmsKeyID.Valid {
		createdKmsKeyID, kmsErr := s.dal.FindOrCreateOrgKmsKey(ctx, orgID, func() ([]byte, error) {
			return s.generateEncryptedKeyMaterial()
		})
		if kmsErr != nil {
			return nil, errutil.DatabaseErr("Failed to ensure organization KMS key").WithErr(kmsErr)
		}
		kmsKeyID.V = createdKmsKeyID
		kmsKeyID.Valid = true
	}

	// Ensure org has a data key (lazy create if missing).
	if org.KmsEncryptedDataKey == nil {
		dataKey, dataErr := s.generateOrgDataKey(ctx, orgID, kmsKeyID.V)
		if dataErr != nil {
			return nil, errutil.DatabaseErr("Failed to ensure organization data key").WithErr(dataErr)
		}
		return dataKey, nil
	}

	// Decrypt existing data key.
	kmsKey, err := s.decryptKmsKey(ctx, kmsKeyID.V)
	if err != nil {
		return nil, err
	}
	return decryptWithVersion(*org.KmsEncryptedDataKey, kmsKey)
}

// generateOrgDataKey creates the org's encrypted data key if it doesn't exist.
// Returns the plaintext data key.
// The caller must ensure the org's KMS key exists before calling this
// to avoid deadlocks with concurrent KMS key + data key creation.
func (s *SharedService) generateOrgDataKey(ctx context.Context, orgID, kmsKeyID uuid.UUID) ([]byte, error) {
	// Decrypt KMS key once — used both for encrypting (create) and decrypting (existing).
	kmsKey, err := s.decryptKmsKey(ctx, kmsKeyID)
	if err != nil {
		return nil, err
	}

	encryptedDataKey, err := s.dal.FindOrCreateOrgDataKey(ctx, orgID, func() ([]byte, error) {
		plainDataKey := make([]byte, 32)
		if _, err := rand.Read(plainDataKey); err != nil {
			return nil, fmt.Errorf("generating data key: %w", err)
		}
		return encryptWithVersion(plainDataKey, kmsKey)
	})

	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find or create organization data key").WithErr(err)
	}

	return decryptWithVersion(encryptedDataKey, kmsKey)
}
