package kms

import (
	"context"
	"crypto/rand"
	"fmt"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
)

func (s *Service) getProjectDataKey(ctx context.Context, projectID string) ([]byte, error) {
	project, err := s.findProjectKmsInfo(ctx, projectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find project KMS info").WithErrf("getProjectDataKey(projectId=%s): %w", projectID, err)
	}

	// Ensure project has a KMS key (lazy create if missing).
	kmsKeyID := project.KmsSecretManagerKeyID
	if !kmsKeyID.Valid {
		createdKmsKeyID, kmsErr := s.findOrCreateProjectKmsKey(ctx, projectID, func() ([]byte, error) {
			return s.generateEncryptedKeyMaterial()
		})
		if kmsErr != nil {
			return nil, errutil.DatabaseErr("Failed to ensure project KMS key").WithErrf("getProjectDataKey(projectId=%s): %w", projectID, kmsErr)
		}
		kmsKeyID.V = createdKmsKeyID
		kmsKeyID.Valid = true
	}

	// Ensure project has a data key (lazy create if missing).
	if len(project.KmsSecretManagerEncryptedDataKey) == 0 {
		dataKey, dataErr := s.generateProjectDataKey(ctx, projectID, kmsKeyID.V)
		if dataErr != nil {
			return nil, errutil.DatabaseErr("Failed to ensure project data key").WithErrf("getProjectDataKey(projectId=%s): %w", projectID, dataErr)
		}
		return dataKey, nil
	}

	// Decrypt existing data key.
	kmsKey, err := s.decryptKmsKey(ctx, kmsKeyID.V)
	if err != nil {
		return nil, err
	}
	return decryptWithVersion(project.KmsSecretManagerEncryptedDataKey, kmsKey)
}

// generateProjectDataKey creates the project's encrypted data key if it doesn't exist.
// Returns the plaintext data key.
// The caller must ensure the project's KMS key exists before calling this
// to avoid deadlocks with concurrent KMS key + data key creation.
func (s *Service) generateProjectDataKey(ctx context.Context, projectID string, kmsKeyID uuid.UUID) ([]byte, error) {
	// Decrypt KMS key once — used both for encrypting (create) and decrypting (existing).
	kmsKey, err := s.decryptKmsKey(ctx, kmsKeyID)
	if err != nil {
		return nil, err
	}

	encryptedDataKey, err := s.findOrCreateProjectDataKey(ctx, projectID, func() ([]byte, error) {
		plainDataKey := make([]byte, 32)
		if _, err := rand.Read(plainDataKey); err != nil {
			return nil, fmt.Errorf("generating data key: %w", err)
		}
		return encryptWithVersion(plainDataKey, kmsKey)
	})
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find or create project data key").WithErrf("generateProjectDataKey(projectId=%s): %w", projectID, err)
	}

	return decryptWithVersion(encryptedDataKey, kmsKey)
}
