package kms

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/infisical/api/internal/libs/errutil"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
)

func (s Service) GetKmsKeyById(ctx context.Context, req *kmsproto.GetKmsKeyByIdRequest) (*kmsproto.KmsKeyResponse, error) {
	if req == nil || strings.TrimSpace(req.GetKeyId()) == "" {
		return nil, errutil.BadRequest("keyId is required").EncError()
	}
	keyID, err := uuid.Parse(req.GetKeyId())
	if err != nil {
		return nil, errutil.BadRequest("invalid keyId: %s", req.GetKeyId()).EncError()
	}

	key, err := s.KmsStore.FindValidationFieldsById(ctx, keyID)
	if err != nil {
		return nil, updateKmsError(err, "find KMS key")
	}

	var description *string
	if key.Description.Valid {
		value := key.Description.V
		description = &value
	}
	var projectID *string
	if key.ProjectID.Valid {
		value := key.ProjectID.V.String()
		projectID = &value
	}
	return &kmsproto.KmsKeyResponse{Key: &kmsproto.KmsKey{
		Id: key.ID.String(), Name: key.Name, Description: description, OrgId: key.OrgID.String(), ProjectId: projectID,
		IsDisabled: key.IsDisabled.V, IsReserved: key.IsReserved.V, KeyUsage: key.KeyUsage,
		IsExportable: key.IsExportable, HasDeleteProtection: key.HasDeleteProtection,
		UpdatedAt: key.UpdatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
	}}, nil
}
