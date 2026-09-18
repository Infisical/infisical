package kms

import (
	"fmt"

	"github.com/infisical/api/internal/libs/crypto/cipher"
)

func (s *Service) encryptRootKey(plainKey []byte, strategy RootKeyEncryptionStrategy) ([]byte, error) {
	switch strategy {
	case StrategyHSM:
		if s.hsm == nil {
			return nil, fmt.Errorf("KMS: HSM service not configured")
		}
		return s.hsm.Encrypt(plainKey)
	case StrategySoftware:
		if len(s.encryptionKey) == 0 {
			return nil, fmt.Errorf("KMS: ENCRYPTION_KEY / ROOT_ENCRYPTION_KEY not set")
		}
		// Root key is encrypted with AES-GCM (no version suffix).
		return cipher.SymmetricEncrypt(plainKey, s.encryptionKey)
	default:
		return nil, fmt.Errorf("KMS: unknown encryption strategy: %s", strategy)
	}
}

// encryptWithVersion encrypts plaintext with AES-GCM-256 and appends the "v01" version suffix.
func encryptWithVersion(plaintext, key []byte) ([]byte, error) {
	encrypted, err := cipher.SymmetricEncrypt(plaintext, key)
	if err != nil {
		return nil, err
	}
	return append(encrypted, []byte(KMSVersion)...), nil
}
