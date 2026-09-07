package cmek

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"github.com/infisical/api/internal/libs/crypto/sign"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/libs/fn"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/permission/cmek"
	"github.com/infisical/api/pkg/services/kms/db/store"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
)

func (h *Handler) getAccessChecker(ctx context.Context, projectId string) (*cmek.CmekAccessChecker, error) {
	identity, err := auth.IdentityFromContext(ctx)
	if err != nil {
		return nil, err
	}

	//  Get permission
	permResult, err := h.permission.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             identity.Actor,
		ActorID:           identity.ActorID,
		ActorAuthMethod:   identity.AuthMethod,
		ActorOrgID:        identity.OrgID,
		ActionProjectType: permission.ActionProjectTypeKMS,
		ProjectID:         projectId,
	})

	if err != nil {
		return nil, err
	}

	return cmek.NewCmekAccessChecker(permResult.Permission.Ability), nil
}

func (h *Handler) requiresPQCLicense(ctx context.Context, algorithm sign.SigningAlgorithm) error {
	if sign.IsPQCAlgorithm(algorithm) {
		if !(h.license.IsValidLicense() && h.license.GetOnPremFeatures().KmsPQC) {
			return errutil.BadRequest("Your license does not include PQC algorithms. Please upgrade to the Enterprise plan to use a PQC algorithm.")
		}
	}
	return nil
}

type keyStateOptions struct {
	AllowInternal  bool
	RejectDisabled bool
}

func validateKeyState(kmsMeta *store.KmsKeyMetaFieldsResult, opts keyStateOptions) error {
	if !opts.AllowInternal && (!kmsMeta.ProjectID.Valid || kmsMeta.IsReserved.V) {
		return errutil.BadRequest("Key is not customer managed")
	}
	if opts.RejectDisabled && kmsMeta.IsDisabled.V {
		return errutil.BadRequest("Key is disabled")
	}
	return nil
}

func (h *Handler) SignWithKmsKey(ctx context.Context, opts *SignWithKmsKeyServiceRequestOptions) (*SignWithKmsKeyResponseData, error) {
	body := opts.Body

	h.logger.InfoContext(ctx, "signing with KMS key",
		slog.String("keyId", opts.PathParams.KeyID.String()),
		slog.String("signingAlgorithm", string(body.SigningAlgorithm)),
		slog.Bool("isDigest", fn.ValueOr(body.IsDigest, false)),
		slog.Int("dataLength", len(body.Data)),
	)

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

	if !checker.CanSign() {
		return nil, errutil.Forbidden("You are not allowed to sign on Cmek")
	}

	if err := h.requiresPQCLicense(ctx, sign.SigningAlgorithm(body.SigningAlgorithm)); err != nil {
		return nil, err
	}

	res, err := h.kms.SignWithKmsKey(ctx, &kmsproto.SignWithKmsKeyRequest{
		KeyId:            opts.PathParams.KeyID.String(),
		SigningAlgorithm: string(opts.Body.SigningAlgorithm),
		IsDigest:         opts.Body.IsDigest,
		Data:             opts.Body.Data,
	})

	if err != nil {
		return nil, errutil.NewFromEnc(err)
	}

	return NewSignWithKmsKeyResponseData(
		&SignWithKmsKeyResponse{
			Signature:        res.Signature,
			KeyID:            uuid.MustParse(res.KeyId),
			SigningAlgorithm: SignWithKmsKeyResponseSigningAlgorithm(res.SigningAlgorithm),
		},
	), nil
}

func (h *Handler) VerifyWithKmsKey(ctx context.Context, opts *VerifyWithKmsKeyServiceRequestOptions) (*VerifyWithKmsKeyResponseData, error) {
	body := opts.Body

	h.logger.InfoContext(ctx, "verify with KMS key",
		slog.String("keyId", opts.PathParams.KeyID.String()),
		slog.String("signingAlgorithm", string(body.SigningAlgorithm)),
		slog.Bool("isDigest", fn.ValueOr(body.IsDigest, false)),
		slog.Int("dataLength", len(body.Data)),
	)

	if err := h.requiresPQCLicense(ctx, sign.SigningAlgorithm(body.SigningAlgorithm)); err != nil {
		return nil, err
	}

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
	if !checker.CanVerify() {
		return nil, errutil.Forbidden("You are not allowed to verify on Cmek")
	}

	res, err := h.kms.VerifyWithKmsKey(ctx, &kmsproto.VerifyWithKmsKeyRequest{
		KeyId:            opts.PathParams.KeyID.String(),
		SigningAlgorithm: string(body.SigningAlgorithm),
		IsDigest:         body.IsDigest,
		Data:             body.Data,
		Signature:        body.Signature,
	})

	if err != nil {
		return nil, errutil.NewFromEnc(err)
	}

	return NewVerifyWithKmsKeyResponseData(&VerifyWithKmsKeyResponse{
		SignatureValid:   res.SignatureValid,
		KeyID:            opts.PathParams.KeyID,
		SigningAlgorithm: VerifyWithKmsKeyResponseSigningAlgorithm(body.SigningAlgorithm),
	}), nil
}
