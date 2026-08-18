package cache

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
)

// GenerateHash creates a URL-safe base64 SHA256 hash of the JSON-serialized data.
// Port of generateCacheKeyFromData from backend/src/lib/crypto/cache.ts.
func GenerateHash(data any) string {
	jsonBytes, err := json.Marshal(data)
	if err != nil {
		return ""
	}
	return HashBytes(jsonBytes)
}

// HashString creates a URL-safe base64 SHA256 hash of a string.
func HashString(s string) string {
	return HashBytes([]byte(s))
}

// HashBytes creates a URL-safe base64 SHA256 hash of raw bytes.
func HashBytes(data []byte) string {
	hash := sha256.Sum256(data)
	encoded := base64.StdEncoding.EncodeToString(hash[:])
	encoded = strings.ReplaceAll(encoded, "+", "-")
	encoded = strings.ReplaceAll(encoded, "/", "_")
	encoded = strings.TrimRight(encoded, "=")
	return encoded
}
