package kms

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/pkg/services/kms/db/store"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
	"github.com/jackc/pgx/v5"
)

func (s Service) DeleteKmsKey(ctx context.Context, req *kmsproto.DeleteKmsKeyRequest) (*kmsproto.KmsKeyResponse, error) {
	if req == nil || req.GetKeyId() == "" {
		return nil, errutil.BadRequest("keyId is required").EncError()
	}

	keyID, err := uuid.Parse(req.GetKeyId())
	if err != nil {
		return nil, errutil.BadRequest("invalid keyId: %s", req.GetKeyId()).EncError()
	}

	kmsKey, err := s.kmsStore.FindValidationFieldsById(ctx, keyID)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errutil.NotFound("Key with ID %s not found", req.GetKeyId()).EncError()
		}
		if appErr, ok := err.(*errutil.Error); ok {
			return nil, appErr.EncError()
		}
		return nil, errutil.DatabaseErr("Failed to find KMS key").WithErr(err).EncError()
	}

	if err := validateKeyState(kmsKey, keyStateOptions{
		RejectDisabled: false,
	}); err != nil {
		return nil, err.EncError()
	}

	if kmsKey.HasDeleteProtection {
		return nil, errutil.BadRequest("Key with ID %s has delete protection enabled. Disable delete protection on the key before deleting it.", req.GetKeyId()).EncError()
	}

	tx, err := s.db.Primary().Begin(ctx)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to begin KMS key deletion transaction").WithErr(err).EncError()
	}
	defer tx.Rollback(ctx)

	deleted, err , onCommitForDelete := s.kmsStore.DeleteKeyById(ctx, req.GetKeyId(), tx)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to delete KMS key").WithErr(err).EncError()
	}
	if !deleted {
		return nil, errutil.BadRequest("Key with ID %s has delete protection enabled. Disable delete protection on the key before deleting it.", req.GetKeyId()).EncError()
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, errutil.DatabaseErr("Failed to commit KMS key deletion").WithErr(err).EncError()
	}
	
	if onCommitForDelete != nil { 
		onCommitForDelete()
	}

	var projectID *string
	if kmsKey.ProjectID.Valid {
		value := kmsKey.ProjectID.V.String()
		projectID = &value
	}

	return &kmsproto.KmsKeyResponse{Key: &kmsproto.KmsKey{
		Id:                  kmsKey.ID.String(),
		OrgId:               kmsKey.OrgID.String(),
		ProjectId:           projectID,
		KeyUsage:            kmsKey.KeyUsage,
		IsDisabled:          kmsKey.IsDisabled.V,
		IsReserved:          kmsKey.IsReserved.V,
		IsExportable:        kmsKey.IsExportable,
		HasDeleteProtection: kmsKey.HasDeleteProtection,
	}}, nil
}

type keyStateOptions struct {
	AllowInternal  bool
	RejectDisabled bool
}

func validateKeyState(kmsMeta *store.KmsKeyMetaFieldsResult, opts keyStateOptions) *errutil.Error {
	if !opts.AllowInternal && (!kmsMeta.ProjectID.Valid || kmsMeta.IsReserved.V) {
		return errutil.BadRequest("Key is not customer managed")
	}
	if opts.RejectDisabled && kmsMeta.IsDisabled.V {
		return errutil.BadRequest("Key is disabled")
	}
	return nil
}
