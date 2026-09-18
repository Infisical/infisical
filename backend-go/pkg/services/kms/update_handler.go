package kms

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/pkg/services/kms/db/store"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
)

func (s Service) UpdateKmsKey(ctx context.Context, req *kmsproto.UpdateKmsKeyRequest) (*kmsproto.KmsKeyResponse, error) {
	if req == nil || strings.TrimSpace(req.GetKeyId()) == "" {
		return nil, errutil.BadRequest("keyId is required").EncError()
	}
	keyID, err := uuid.Parse(req.GetKeyId())
	if err != nil {
		return nil, errutil.BadRequest("invalid keyId: %s", req.GetKeyId()).EncError()
	}
	if req.Name == nil && req.IsDisabled == nil && req.Description == nil && req.HasDeleteProtection == nil {
		return nil, errutil.BadRequest("at least one field must be provided to update the KMS key").EncError()
	}
	if req.Name != nil && strings.TrimSpace(req.GetName()) == "" {
		return nil, errutil.BadRequest("name must not be empty").EncError()
	}

	meta, err := s.KmsStore.FindValidationFieldsById(ctx, keyID)
	if err != nil {
		return nil, updateKmsError(err, "find KMS key")
	}
	if err := validateKeyState(meta, keyStateOptions{}); err != nil {
		return nil, err.EncError()
	}

	tx, err := s.db.Primary().Begin(ctx)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to begin KMS key update transaction").WithErr(err).EncError()
	}
	defer tx.Rollback(ctx)

	_, err, onCommit := s.KmsStore.UpdateKmsKey(ctx, req.GetKeyId(), &store.UpdateKmsKeyParams{
		Name: req.Name, IsDisabled: req.IsDisabled, Description: req.Description, HasDeleteProtection: req.HasDeleteProtection,
	}, tx)
	if err != nil {
		return nil, updateKmsError(err, "update KMS key")
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, errutil.DatabaseErr("Failed to commit KMS key update").WithErr(err).EncError()
	}
	if onCommit != nil {
		onCommit()
	}

	key, err := s.KmsStore.GetKey(ctx, keyID)
	if err != nil {
		return nil, updateKmsError(err, "load updated KMS key")
	}
	return &kmsproto.KmsKeyResponse{Key: keyResponse(key)}, nil
}

func updateKmsError(err error, operation string) error {
	if appErr, ok := err.(*errutil.Error); ok {
		return appErr.EncError()
	}
	return errutil.DatabaseErr("Failed to process KMS key update").WithErrf("%s: %w", operation, err).EncError()
}

func keyResponse(key *store.GetKeyResult) *kmsproto.KmsKey {
	var projectID *string
	if key.ProjectID.Valid {
		value := key.ProjectID.V.String()
		projectID = &value
	}
	var description *string
	if key.Description.Valid {
		description = &key.Description.V
	}
	return &kmsproto.KmsKey{
		Id: key.ID.String(), Name: key.Name, Description: description, OrgId: key.OrgID.String(), ProjectId: projectID,
		KeyUsage: key.KeyUsage, IsDisabled: key.IsDisabled, IsReserved: key.IsReserved, IsExportable: key.IsExportable,
		HasDeleteProtection: key.HasDeleteProtection, CreatedAt: key.CreatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		UpdatedAt: key.UpdatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
	}
}
