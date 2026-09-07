//go:generate go tool oapi-codegen -config cfg.yaml openapi.yml

package cmek

import (
	"context"
	"log/slog"

	"github.com/infisical/api/internal/ee/services/license"
	"github.com/infisical/api/internal/server/api/platform/projects"
	"github.com/infisical/api/pkg/services/kms/db/store"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
)

type Handler struct {
	logger       *slog.Logger
	kms          kmsproto.KMSServiceClient
	permission   projects.PermissionService
	license      *license.Service
	kmsStore     store.KMSStore
	keyMetaCache *store.KeyMetaCache
}


// BulkExportKmsKeyPrivateKeys implements [ServiceInterface].
func (h *Handler) BulkExportKmsKeyPrivateKeys(ctx context.Context, opts *BulkExportKmsKeyPrivateKeysServiceRequestOptions) (*BulkExportKmsKeyPrivateKeysResponseData, error) {
	panic("unimplemented")
}

// BulkImportKmsKeys implements [ServiceInterface].
func (h *Handler) BulkImportKmsKeys(ctx context.Context, opts *BulkImportKmsKeysServiceRequestOptions) (*BulkImportKmsKeysResponseData, error) {
	panic("unimplemented")
}

// DecryptWithKmsKey implements [ServiceInterface].
func (h *Handler) DecryptWithKmsKey(ctx context.Context, opts *DecryptWithKmsKeyServiceRequestOptions) (*DecryptWithKmsKeyResponseData, error) {
	panic("unimplemented")
}

// EncryptWithKmsKey implements [ServiceInterface].
func (h *Handler) EncryptWithKmsKey(ctx context.Context, opts *EncryptWithKmsKeyServiceRequestOptions) (*EncryptWithKmsKeyResponseData, error) {
	panic("unimplemented")
}

// GenerateMacWithKmsKey implements [ServiceInterface].
func (h *Handler) GenerateMacWithKmsKey(ctx context.Context, opts *GenerateMacWithKmsKeyServiceRequestOptions) (*GenerateMacWithKmsKeyResponseData, error) {
	panic("unimplemented")
}

// GetAPIGoAPIV1ProjectsProjectIDKms implements [ServiceInterface].
func (h *Handler) GetAPIGoV1ProjectsProjectIDKms(ctx context.Context, opts *GetAPIGoV1ProjectsProjectIDKmsServiceRequestOptions) (*GetAPIGoV1ProjectsProjectIDKmsResponseData, error) {
	panic("unimplemented")
}

// GetAPIGoAPIV1ProjectsProjectIDKmsBackup implements [ServiceInterface].
func (h *Handler) GetAPIGoV1ProjectsProjectIDKmsBackup(ctx context.Context, opts *GetAPIGoV1ProjectsProjectIDKmsBackupServiceRequestOptions) (*GetAPIGoV1ProjectsProjectIDKmsBackupResponseData, error) {
	panic("unimplemented")
}

// GetKmsKeyByID implements [ServiceInterface].
func (h *Handler) GetKmsKeyByID(ctx context.Context, opts *GetKmsKeyByIDServiceRequestOptions) (*GetKmsKeyByIDResponseData, error) {
	panic("unimplemented")
}

// GetKmsKeyByName implements [ServiceInterface].
func (h *Handler) GetKmsKeyByName(ctx context.Context, opts *GetKmsKeyByNameServiceRequestOptions) (*GetKmsKeyByNameResponseData, error) {
	panic("unimplemented")
}

// GetKmsKeyPrivateKey implements [ServiceInterface].
func (h *Handler) GetKmsKeyPrivateKey(ctx context.Context, opts *GetKmsKeyPrivateKeyServiceRequestOptions) (*GetKmsKeyPrivateKeyResponseData, error) {
	panic("unimplemented")
}

// GetKmsKeyPublicKey implements [ServiceInterface].
func (h *Handler) GetKmsKeyPublicKey(ctx context.Context, opts *GetKmsKeyPublicKeyServiceRequestOptions) (*GetKmsKeyPublicKeyResponseData, error) {
	panic("unimplemented")
}

// ListKmsKeySigningAlgorithms implements [ServiceInterface].
func (h *Handler) ListKmsKeySigningAlgorithms(ctx context.Context, opts *ListKmsKeySigningAlgorithmsServiceRequestOptions) (*ListKmsKeySigningAlgorithmsResponseData, error) {
	panic("unimplemented")
}

// ListKmsKeys implements [ServiceInterface].
func (h *Handler) ListKmsKeys(ctx context.Context, opts *ListKmsKeysServiceRequestOptions) (*ListKmsKeysResponseData, error) {
	panic("unimplemented")
}

// PatchAPIGoAPIV1ProjectsProjectIDKms implements [ServiceInterface].
func (h *Handler) PatchAPIGoV1ProjectsProjectIDKms(ctx context.Context, opts *PatchAPIGoV1ProjectsProjectIDKmsServiceRequestOptions) (*PatchAPIGoV1ProjectsProjectIDKmsResponseData, error) {
	panic("unimplemented")
}

// PostAPIGoAPIV1ProjectsProjectIDKmsBackup implements [ServiceInterface].
func (h *Handler) PostAPIGoV1ProjectsProjectIDKmsBackup(ctx context.Context, opts *PostAPIGoV1ProjectsProjectIDKmsBackupServiceRequestOptions) (*PostAPIGoV1ProjectsProjectIDKmsBackupResponseData, error) {
	panic("unimplemented")
}

// RotateKmsKey implements [ServiceInterface].
func (h *Handler) RotateKmsKey(ctx context.Context, opts *RotateKmsKeyServiceRequestOptions) (*RotateKmsKeyResponseData, error) {
	panic("unimplemented")
}

// UpdateKmsKey implements [ServiceInterface].
func (h *Handler) UpdateKmsKey(ctx context.Context, opts *UpdateKmsKeyServiceRequestOptions) (*UpdateKmsKeyResponseData, error) {
	panic("unimplemented")
}

// VerifyMacWithKmsKey implements [ServiceInterface].
func (h *Handler) VerifyMacWithKmsKey(ctx context.Context, opts *VerifyMacWithKmsKeyServiceRequestOptions) (*VerifyMacWithKmsKeyResponseData, error) {
	panic("unimplemented")
}

type Options struct {
	Logger     *slog.Logger
	Kms        kmsproto.KMSServiceClient
	Permission projects.PermissionService
	KmsStore   store.KMSStore
	License    *license.Service
}

func NewHandler(opts Options) *Handler {
	return &Handler{
		logger:     opts.Logger,
		kms:        opts.Kms,
		permission: opts.Permission,
		kmsStore:   opts.KmsStore,
		license:    opts.License,
	}
}
