package kms

import (
	"context"
	"encoding/base64"

	"github.com/google/uuid"
	"github.com/infisical/api/internal/libs/crypto/cipher"
	"github.com/infisical/api/internal/libs/crypto/sign"
	"github.com/infisical/api/internal/libs/errutil"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
)

func (s *Service) sign(ctx context.Context, req *kmsproto.SignWithKmsKeyRequest) (*kmsproto.SignWithKmsKeyResponse, error) {

	decodedKey, err := s.validateReqAndRetrieveDecodedKey(ctx, req.KeyId, sign.SigningAlgorithm(req.GetSigningAlgorithm()), req.GetData())
	if err != nil {
		return nil, err
	}

	data, err := base64.StdEncoding.DecodeString(req.GetData())
	if err != nil {
		return nil, errutil.BadRequest("data must be base64 encoded").EncError()
	}

	signature, err := sign.Sign(data, decodedKey, sign.SigningAlgorithm(req.SigningAlgorithm), *req.IsDigest)
	if err != nil {
		return nil, errutil.CryptographicErr("%s", err.Error()).EncError()
	}

	return &kmsproto.SignWithKmsKeyResponse{
		Signature:        base64.StdEncoding.EncodeToString(signature),
		KeyId:            req.KeyId,
		SigningAlgorithm: req.SigningAlgorithm,
	}, nil

}

func (s *Service) validateReqAndRetrieveDecodedKey(ctx context.Context, keyId string, signingAlgorithm sign.SigningAlgorithm, data string) ([]byte, error) {
	if keyId == "" || signingAlgorithm == "" || data == "" {
		return nil, errutil.BadRequest("keyId, signingAlgorithm, and data are required").EncError()
	}

	keyID, err := uuid.Parse(keyId)
	if err != nil {
		return nil, errutil.BadRequest("invalid keyId: %s", keyID).EncError()
	}
	_, err = base64.StdEncoding.DecodeString(data)
	if err != nil {
		return nil, errutil.BadRequest("data must be base64 encoded").EncError()
	}

	kmsKey, err := s.KmsStore.GetKey(ctx, keyID)

	if err != nil {
		return nil, errutil.DatabaseErr("failed to retrieve KMS key").WithErr(err).EncError()
	}

	if kmsKey.ExternalKMSID.Valid {
		return nil, errutil.BadRequest("External kms keys are not supported for sign/verify operations").EncError()
	}

	if err := sign.ValidateSigningAlgorithmWithKeyType(kmsKey.InternalEncryptionAlgorithm.V, sign.SigningAlgorithm(signingAlgorithm)); err != nil {
		// todo: err message
		return nil, errutil.BadRequest("%s", err.Error()).EncError()
	}

	if kmsKey.KeyUsage != string(SignVerify) {
		return nil, errutil.BadRequest("unsupported sign/verify opertion for kms key type %s", kmsKey.KeyUsage).EncError()
	}

	decodedKey, err := cipher.SymmetricDecrypt(kmsKey.InternalEncryptedKey.V, s.rootEncryptionKey)

	if err != nil {
		return nil, errutil.CryptographicErr("failed to decode encrypted kms key").EncError()
	}
	return decodedKey, nil
}
