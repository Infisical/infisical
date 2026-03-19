package keystore

import (
	"crypto/sha256"
	"encoding/binary"
)

func stringToLockID(s string) int64 {
	hash := sha256.Sum256([]byte(s))
	// Take the first 8 bytes and interpret as int64
	return int64(binary.BigEndian.Uint64(hash[:8]))
}
