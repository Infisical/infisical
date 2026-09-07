package cmek

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/infisical/api/internal/libs/errutil"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
)

// DeleteKmsKey implements [ServiceInterface].
func (h *Handler) DeleteKmsKey(ctx context.Context, opts *DeleteKmsKeyServiceRequestOptions) (*DeleteKmsKeyResponseData, error) {
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

	if !checker.CanDelete() {
		return nil, errutil.Forbidden("You are not allowed to delete on Cmek")
	}

	res, err := h.kms.DeleteKmsKey(ctx, &kmsproto.DeleteKmsKeyRequest{
		KeyId: opts.PathParams.KeyID.String(),
	})
	if err != nil {
		return nil, errutil.NewFromEnc(err)
	}

	key := res.GetKey()
	createdAt, _ := time.Parse(time.RFC3339Nano, key.GetCreatedAt())
	updatedAt, _ := time.Parse(time.RFC3339Nano, key.GetUpdatedAt())
	return NewDeleteKmsKeyResponseData(&DeleteKmsKeyResponse{
		Key: DeleteKmsKey_Response_Key{
			ID:                  uuid.MustParse(key.GetId()),
			Description:         key.Description,
			IsDisabled:          pointer(key.GetIsDisabled()),
			OrgID:               uuid.MustParse(key.GetOrgId()),
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

func pointer[T any](value T) *T {
	return &value
}
