package kms

import (
	"crypto/rand"
	"fmt"
)

// generateRandomKeyName generates a random 8-character hex name for a KMS key.
func generateRandomKeyName() string {
	b := make([]byte, 4)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}