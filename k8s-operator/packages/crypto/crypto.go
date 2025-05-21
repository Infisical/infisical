package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"fmt"
	"hash/crc32"

	"golang.org/x/crypto/nacl/box"
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

func DecryptAsymmetric(ciphertext []byte, nonce []byte, publicKey []byte, privateKey []byte) (plainText []byte) {
	plainTextToReturn, _ := box.Open(nil, ciphertext, (*[24]byte)(nonce), (*[32]byte)(publicKey), (*[32]byte)(privateKey))
	return plainTextToReturn
}

func ComputeEtag(data []byte) string {
	crc := crc32.ChecksumIEEE(data)
	return fmt.Sprintf(`W/"secrets-%d-%08X"`, len(data), crc)
}
