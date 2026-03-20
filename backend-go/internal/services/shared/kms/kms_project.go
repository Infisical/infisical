package kms

import (
	"context"
	"crypto/rand"
	"fmt"

	"github.com/google/uuid"
)

func (s *SharedService) getProjectDataKey(ctx context.Context, projectID string) ([]byte, error) {
	project, err := s.dal.FindProjectKmsInfo(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("KMS: finding project: %w", err)
	}

	// Ensure project has a KMS key (lazy create if missing).
	kmsKeyID := project.KmsSecretManagerKeyId
	if !kmsKeyID.Valid {
		createdKmsKeyID, kmsErr := s.dal.FindOrCreateProjectKmsKey(ctx, projectID, func() ([]byte, error) {
			return s.generateEncryptedKeyMaterial()
		})
		if kmsErr != nil {
			return nil, fmt.Errorf("KMS: ensuring project KMS key: %w", kmsErr)
		}
		kmsKeyID.V = createdKmsKeyID
		kmsKeyID.Valid = true
	}

	// Ensure project has a data key (lazy create if missing).
	if project.KmsSecretManagerEncryptedDataKey == nil {
		dataKey, dataErr := s.generateProjectDataKey(ctx, projectID, kmsKeyID.V)
		if dataErr != nil {
			return nil, fmt.Errorf("KMS: ensuring project data key: %w", dataErr)
		}
		return dataKey, nil
	}

	// Decrypt existing data key.
	kmsKey, err := s.decryptKmsKey(ctx, kmsKeyID.V)
	if err != nil {
		return nil, err
	}
	return decryptWithVersion(*project.KmsSecretManagerEncryptedDataKey, kmsKey)
}

// generateProjectDataKey creates the project's encrypted data key if it doesn't exist.
// Returns the plaintext data key.
// The caller must ensure the project's KMS key exists before calling this
// to avoid deadlocks with concurrent KMS key + data key creation.
func (s *SharedService) generateProjectDataKey(ctx context.Context, projectID string, kmsKeyID uuid.UUID) ([]byte, error) {
	// Decrypt KMS key once — used both for encrypting (create) and decrypting (existing).
	kmsKey, err := s.decryptKmsKey(ctx, kmsKeyID)
	if err != nil {
		return nil, err
	}

	encryptedDataKey, err := s.dal.FindOrCreateProjectDataKey(ctx, projectID, func() ([]byte, error) {
		plainDataKey := make([]byte, 32)
		if _, err := rand.Read(plainDataKey); err != nil {
			return nil, fmt.Errorf("generating data key: %w", err)
		}
		return encryptWithVersion(plainDataKey, kmsKey)
	})
	if err != nil {
		return nil, err
	}

	return decryptWithVersion(encryptedDataKey, kmsKey)
}
