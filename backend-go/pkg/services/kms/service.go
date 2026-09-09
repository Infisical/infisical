package kms

import (
	"context"

	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
)

// BulkExportKmsKeyPrivateKeys implements [kmsproto.KMSServiceServer].
func (s Service) BulkExportKmsKeyPrivateKeys(context.Context, *kmsproto.BulkExportKmsKeyPrivateKeysRequest) (*kmsproto.BulkExportKmsKeyPrivateKeysResponse, error) {
	panic("unimplemented")
}

// BulkImportKmsKeys implements [kmsproto.KMSServiceServer].
func (s Service) BulkImportKmsKeys(context.Context, *kmsproto.BulkImportKmsKeysRequest) (*kmsproto.BulkImportKmsKeysResponse, error) {
	panic("unimplemented")
}

// CreateKmsKey implements [kmsproto.KMSServiceServer].
func (s Service) CreateKmsKey(ctx context.Context, req *kmsproto.CreateKmsKeyRequest) (*kmsproto.CreateKmsKeyResponse, error) {
	return s.createKmsKey(ctx, req, nil)
}

// DecryptWithKmsKey implements [kmsproto.KMSServiceServer].
func (s Service) DecryptWithKmsKey(context.Context, *kmsproto.DecryptWithKmsKeyRequest) (*kmsproto.DecryptWithKmsKeyResponse, error) {
	panic("unimplemented")
}

// EncryptWithKmsKey implements [kmsproto.KMSServiceServer].
func (s Service) EncryptWithKmsKey(context.Context, *kmsproto.EncryptWithKmsKeyRequest) (*kmsproto.EncryptWithKmsKeyResponse, error) {
	panic("unimplemented")
}

// GenerateMacWithKmsKey implements [kmsproto.KMSServiceServer].
func (s Service) GenerateMacWithKmsKey(context.Context, *kmsproto.GenerateMacWithKmsKeyRequest) (*kmsproto.GenerateMacWithKmsKeyResponse, error) {
	panic("unimplemented")
}

// GetKmsKeyByName implements [kmsproto.KMSServiceServer].
func (s Service) GetKmsKeyByName(context.Context, *kmsproto.GetKmsKeyByNameRequest) (*kmsproto.KmsKeyResponse, error) {
	panic("unimplemented")
}

// GetKmsKeyPrivateKey implements [kmsproto.KMSServiceServer].
func (s Service) GetKmsKeyPrivateKey(context.Context, *kmsproto.GetKmsKeyPrivateKeyRequest) (*kmsproto.GetKmsKeyPrivateKeyResponse, error) {
	panic("unimplemented")
}

// GetKmsKeyPublicKey implements [kmsproto.KMSServiceServer].
func (s Service) GetKmsKeyPublicKey(context.Context, *kmsproto.GetKmsKeyPublicKeyRequest) (*kmsproto.GetKmsKeyPublicKeyResponse, error) {
	panic("unimplemented")
}

// ListKmsKeySigningAlgorithms implements [kmsproto.KMSServiceServer].
func (s Service) ListKmsKeySigningAlgorithms(context.Context, *kmsproto.ListKmsKeySigningAlgorithmsRequest) (*kmsproto.ListKmsKeySigningAlgorithmsResponse, error) {
	panic("unimplemented")
}

// ListKmsKeys implements [kmsproto.KMSServiceServer].
func (s Service) ListKmsKeys(context.Context, *kmsproto.ListKmsKeysRequest) (*kmsproto.ListKmsKeysResponse, error) {
	panic("unimplemented")
}

// RotateKmsKey implements [kmsproto.KMSServiceServer].
func (s Service) RotateKmsKey(context.Context, *kmsproto.RotateKmsKeyRequest) (*kmsproto.KmsKeyResponse, error) {
	panic("unimplemented")
}

// SignWithKmsKey implements [kmsproto.KMSServiceServer].
func (s Service) SignWithKmsKey(ctx context.Context, req *kmsproto.SignWithKmsKeyRequest) (*kmsproto.SignWithKmsKeyResponse, error) {
	return s.sign(ctx, req)
}

// VerifyMacWithKmsKey implements [kmsproto.KMSServiceServer].
func (s Service) VerifyMacWithKmsKey(context.Context, *kmsproto.VerifyMacWithKmsKeyRequest) (*kmsproto.VerifyMacWithKmsKeyResponse, error) {
	panic("unimplemented")
}

// VerifyWithKmsKey implements [kmsproto.KMSServiceServer].
func (s Service) VerifyWithKmsKey(ctx context.Context, req *kmsproto.VerifyWithKmsKeyRequest) (*kmsproto.VerifyWithKmsKeyResponse, error) {
	return s.verify(ctx, req)
}

// mustEmbedUnimplementedKMSServiceServer implements [kmsproto.KMSServiceServer].
func (s Service) mustEmbedUnimplementedKMSServiceServer() {
	panic("unimplemented")
}
