package cmek

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/infisical/api/internal/libs/crypto/sign"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/auth"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
)

// CreateKmsKey implements [ServiceInterface].
func (h *Handler) CreateKmsKey(ctx context.Context, opts *CreateKmsKeyServiceRequestOptions) (*CreateKmsKeyResponseData, error) {
	body := opts.Body

	h.logger.InfoContext(ctx, "creating KMS key",
		slog.String("projectId", body.ProjectID),
		slog.String("name", body.Name),
	)

	// Keep these fallbacks even though the OpenAPI schema declares defaults: the
	// generated decoder leaves optional fields nil when clients omit them.

	keyUsage := EncryptDecrypt
	if body.KeyUsage != nil {
		keyUsage = *body.KeyUsage
	}

	algorithm := Aes256Gcm
	if body.Algorithm != nil {
		algorithm = *body.Algorithm
	}

	isExportable := true
	if body.IsExportable != nil {
		isExportable = *body.IsExportable
	}

	hasDeleteProtection := false
	if body.HasDeleteProtection != nil {
		hasDeleteProtection = *body.HasDeleteProtection
	}
	keyUsageValue := string(keyUsage)
	algorithmValue := string(algorithm)

	checker, err := h.getAccessChecker(ctx, opts.Body.ProjectID)
	if err != nil {
		return nil, err
	}
	identity, err := auth.IdentityFromContext(ctx)
	if err != nil {
		return nil, err
	}

	if !checker.CanCreate() {
		return nil, errutil.Forbidden("You are not allowed to create on Cmek")
	}

	if err := h.requiresPQCLicense(ctx, sign.SigningAlgorithm(algorithm)); err != nil {
		return nil, err
	}

	// The KMS service currently returns only the new ID, so timestamps are set at
	// the API boundary until the service response carries the complete key.
	req, err := h.kms.CreateKmsKey(ctx, &kmsproto.CreateKmsKeyRequest{
		ProjectId:           body.ProjectID,
		Name:                body.Name,
		Description:         body.Description,
		KeyUsage:            &keyUsageValue,
		Algorithm:           &algorithmValue,
		IsExportable:        &isExportable,
		HasDeleteProtection: &hasDeleteProtection,
		OrgId:               identity.OrgID.String(),
	})
	if err != nil {
		return nil, errutil.NewFromEnc(err)
	}

	keyID, err := uuid.Parse(req.GetKeyId())
	if err != nil {
		return nil, errutil.InternalServer("KMS service returned an invalid key ID").WithErr(err).EncError()
	}

	createdAt, err := time.Parse(time.RFC3339Nano, req.GetCreatedAt())
	if err != nil {
		return nil, errutil.InternalServer("KMS service returned an invalid created timestamp").WithErr(err).EncError()
	}
	updatedAt, err := time.Parse(time.RFC3339Nano, req.GetUpdatedAt())
	if err != nil {
		return nil, errutil.InternalServer("KMS service returned an invalid updated timestamp").WithErr(err).EncError()
	}

	return NewCreateKmsKeyResponseData(&CreateKmsKeyResponse{
		Key: CreateKmsKey_Response_Key{
			ID:                  keyID,
			Description:         body.Description,
			IsDisabled:          new(false),
			OrgID:               identity.OrgID,
			Name:                body.Name,
			CreatedAt:           createdAt,
			UpdatedAt:           updatedAt,
			ProjectID:           new(body.ProjectID),
			KeyUsage:            &keyUsageValue,
			IsExportable:        &isExportable,
			HasDeleteProtection: &hasDeleteProtection,
			Version:             new(float32(1)),
			Algorithm:           string(algorithm),
		},
	}), nil

}
