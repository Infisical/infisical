package cipher_test

import (
	"bytes"
	"crypto/rand"
	"testing"

	"github.com/infisical/api/internal/crypto/cipher"
)

func TestEncryptDecryptRoundTrip(t *testing.T) {
	key := make([]byte, 32) // AES-256
	if _, err := rand.Read(key); err != nil {
		t.Fatal(err)
	}

	plaintext := []byte("hello infisical")

	blob, err := cipher.SymmetricEncrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	// Blob must be longer than plaintext (12 IV + 16 tag overhead).
	if len(blob) != 12+len(plaintext)+16 {
		t.Fatalf("unexpected blob length: got %d, want %d", len(blob), 12+len(plaintext)+16)
	}

	got, err := cipher.SymmetricDecrypt(blob, key)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}

	if !bytes.Equal(got, plaintext) {
		t.Fatalf("round-trip mismatch: got %q, want %q", got, plaintext)
	}
}

func TestDecryptWrongKey(t *testing.T) {
	key1 := make([]byte, 32)
	key2 := make([]byte, 32)
	rand.Read(key1)
	rand.Read(key2)

	blob, err := cipher.SymmetricEncrypt([]byte("secret"), key1)
	if err != nil {
		t.Fatal(err)
	}

	_, err = cipher.SymmetricDecrypt(blob, key2)
	if err == nil {
		t.Fatal("expected decryption to fail with wrong key")
	}
}

func TestDecryptTooShort(t *testing.T) {
	_, err := cipher.SymmetricDecrypt([]byte("short"), make([]byte, 32))
	if err == nil {
		t.Fatal("expected error for short ciphertext")
	}
}

func TestEncryptProducesDifferentBlobs(t *testing.T) {
	key := make([]byte, 32)
	rand.Read(key)

	blob1, _ := cipher.SymmetricEncrypt([]byte("same"), key)
	blob2, _ := cipher.SymmetricEncrypt([]byte("same"), key)

	if bytes.Equal(blob1, blob2) {
		t.Fatal("two encryptions of the same plaintext should differ (random IV)")
	}
}

func TestAES128Key(t *testing.T) {
	key := make([]byte, 16) // AES-128
	rand.Read(key)

	plaintext := []byte("128-bit key test")

	blob, err := cipher.SymmetricEncrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt with 128-bit key: %v", err)
	}

	got, err := cipher.SymmetricDecrypt(blob, key)
	if err != nil {
		t.Fatalf("Decrypt with 128-bit key: %v", err)
	}

	if !bytes.Equal(got, plaintext) {
		t.Fatalf("round-trip mismatch: got %q, want %q", got, plaintext)
	}
}
