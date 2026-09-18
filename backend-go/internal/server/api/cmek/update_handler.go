package cmek

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/infisical/api/internal/libs/errutil"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
)

// UpdateKmsKey implements [ServiceInterface].
func (h *Handler) UpdateKmsKey(ctx context.Context, opts *UpdateKmsKeyServiceRequestOptions) (*UpdateKmsKeyResponseData, error) {
	kmsMeta, err := h.kmsStore.FindValidationFieldsById(ctx, opts.PathParams.KeyID)
	if err != nil {
		return nil, err
	}
	if err := validateKeyState(kmsMeta, keyStateOptions{}); err != nil {
		return nil, err
	}

	checker, err := h.getAccessChecker(ctx, kmsMeta.ProjectID.V.String())
	if err != nil {
		return nil, err
	}
	if !checker.CanEdit() {
		return nil, errutil.Forbidden("You are not allowed to update Cmek")
	}

	body := opts.Body
	res, err := h.kms.UpdateKmsKey(ctx, &kmsproto.UpdateKmsKeyRequest{
		KeyId:               opts.PathParams.KeyID.String(),
		Name:                body.Name,
		IsDisabled:          body.IsDisabled,
		Description:         body.Description,
		HasDeleteProtection: body.HasDeleteProtection,
	})
	if err != nil {
		return nil, errutil.NewFromEnc(err)
	}

	key := res.GetKey()
	if key == nil {
		return nil, errutil.InternalServer("KMS service returned no updated key")
	}
	keyID, err := uuid.Parse(key.GetId())
	if err != nil {
		return nil, errutil.InternalServer("KMS service returned an invalid key ID").WithErr(err)
	}
	orgID, err := uuid.Parse(key.GetOrgId())
	if err != nil {
		return nil, errutil.InternalServer("KMS service returned an invalid organization ID").WithErr(err)
	}
	createdAt, err := time.Parse(time.RFC3339Nano, key.GetCreatedAt())
	if err != nil {
		return nil, errutil.InternalServer("KMS service returned an invalid creation timestamp").WithErr(err)
	}
	updatedAt, err := time.Parse(time.RFC3339Nano, key.GetUpdatedAt())
	if err != nil {
		return nil, errutil.InternalServer("KMS service returned an invalid update timestamp").WithErr(err)
	}

	return NewUpdateKmsKeyResponseData(&UpdateKmsKeyResponse{
		Key: UpdateKmsKey_Response_Key{
			ID:                  keyID,
			Description:         key.Description,
			IsDisabled:          pointer(key.GetIsDisabled()),
			OrgID:               orgID,
			Name:                key.GetName(),
			CreatedAt:           createdAt,
			UpdatedAt:           updatedAt,
			ProjectID:           key.ProjectId,
			KeyUsage:            pointer(key.GetKeyUsage()),
			IsExportable:        pointer(key.GetIsExportable()),
			HasDeleteProtection: pointer(key.GetHasDeleteProtection()),
			Version:             pointer(float32(key.GetVersion())),
			Algorithm:           key.GetEncryptionAlgorithm(),
		},
	}), nil
}
