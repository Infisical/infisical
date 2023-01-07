package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"io"

	"github.com/Infisical/infisical-merge/packages/models"
	"golang.org/x/crypto/nacl/box"
)

// will decrypt cipher text to plain text using iv and tag
func DecryptSymmetric(key []byte, cipherText []byte, tag []byte, iv []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	aesgcm, err := cipher.NewGCMWithNonceSize(block, len(iv))
	if err != nil {
		return nil, err
	}

	var nonce = iv
	var ciphertext = append(cipherText, tag...) // the aesgcm open method expects auth tag at the end of the cipher text

	plaintext, err := aesgcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, err
	}

	return plaintext, nil
}

func GenerateNewKey() (newKey []byte, keyErr error) {
	key := make([]byte, 16) // block size defaults to 16 so this is fine
	_, err := rand.Read(key)
	return key, err
}

// Will encrypt a plain text with the provided key
func EncryptSymmetric(plaintext []byte, key []byte) (result models.SymmetricEncryptionResult, err error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return models.SymmetricEncryptionResult{}, err
	}

	aesgcm, err := cipher.NewGCMWithNonceSize(block, 16) // default is 12, 16 because https://github.com/Infisical/infisical/blob/bea0ff6e05a4de73a5db625d4ae181a015b50855/backend/src/utils/aes-gcm.ts#L4
	if err != nil {
		return models.SymmetricEncryptionResult{}, err
	}

	// create a nonce
	nonce := make([]byte, aesgcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		panic(err)
	}

	ciphertext := aesgcm.Seal(nil, nonce, plaintext, nil)

	ciphertextOnly := ciphertext[:len(ciphertext)-16] // combines the auth tag with the cipher text so we need to extract it

	authTag := ciphertext[len(ciphertext)-16:]

	return models.SymmetricEncryptionResult{
		CipherText: ciphertextOnly,
		AuthTag:    authTag,
		Nonce:      nonce,
	}, nil
}

func DecryptAsymmetric(ciphertext []byte, nonce []byte, publicKey []byte, privateKey []byte) (plainText []byte) {
	plainTextToReturn, _ := box.Open(nil, ciphertext, (*[24]byte)(nonce), (*[32]byte)(publicKey), (*[32]byte)(privateKey))
	return plainTextToReturn
}

func EncryptAssymmetric(message []byte, nonce []byte, publicKey []byte, privateKey []byte) (encryptedMessage []byte) {
	encryptedPlainText := box.Seal(nil, message, (*[24]byte)(nonce), (*[32]byte)(publicKey), (*[32]byte)(privateKey))
	return encryptedPlainText
}
