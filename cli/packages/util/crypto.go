package util

import (
	"crypto/aes"
	"crypto/cipher"
)

func DecryptSymmetric(key []byte, encryptedPrivateKey []byte, tag []byte, IV []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	aesgcm, err := cipher.NewGCMWithNonceSize(block, len(IV))
	if err != nil {
		return nil, err
	}

	var nonce = IV
	var ciphertext = append(encryptedPrivateKey, tag...)

	plaintext, err := aesgcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, err
	}

	return plaintext, nil
}
