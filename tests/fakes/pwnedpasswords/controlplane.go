package pwnedpasswords

import (
	"crypto/sha1"
	"encoding/hex"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Breach lists password as seen in count breaches, until the test ends.
func Breach(tt *testing.T, adminURL, password string, count int) {
	tt.Helper()
	sum := sha1.Sum([]byte(password))
	hash := strings.ToUpper(hex.EncodeToString(sum[:]))
	fakenet.Open[Range](tt, adminURL, Service.Host(), hash[:5]).Seed(tt, map[string]any{
		"suffixes": map[string]int{hash[5:]: count},
	})
}
