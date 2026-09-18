package kms

import (
	"context"
	"encoding/base64"

	"github.com/infisical/api/internal/libs/crypto/sign"
	"github.com/infisical/api/internal/libs/errutil"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
)

func (s *Service) verify(ctx context.Context, req *kmsproto.VerifyWithKmsKeyRequest) (*kmsproto.VerifyWithKmsKeyResponse, error) {
	decodedKey, err := s.validateReqAndRetrieveDecodedKey(ctx, req.KeyId, sign.SigningAlgorithm(req.GetSigningAlgorithm()), req.GetData())
	if err != nil {
		return nil, err
	}

	data, err := base64.StdEncoding.DecodeString(req.GetData())
	if err != nil {
		return nil, errutil.BadRequest("data must be base64 encoded").EncError()
	}
	signature, err := base64.StdEncoding.DecodeString(req.GetSignature())
	if err != nil {
		return nil, errutil.BadRequest("signature must be base64 encoded").EncError()
	}
	publicKey, err := sign.PublicKeyFromPrivate(decodedKey)
	if err != nil {
		return nil, errutil.CryptographicErr("failed to derive public key for verification").EncError()
	}

	var success bool
	if success, err = sign.Verify(data, signature, publicKey, sign.SigningAlgorithm(req.SigningAlgorithm), *req.IsDigest); err != nil {
		return nil, errutil.CryptographicErr("failed to verify signatures with kms key").EncError()
	}

	return &kmsproto.VerifyWithKmsKeyResponse{
		SignatureValid:   success,
		KeyId:            req.KeyId,
		SigningAlgorithm: req.SigningAlgorithm,
	}, nil
}
