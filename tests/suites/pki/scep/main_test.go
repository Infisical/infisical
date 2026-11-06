package scep_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/smallstep/pkcs7"
)

func TestMain(m *testing.M) {
	// The library defaults to DES-CBC, which Infisical refuses; sscep, which this
	// suite replaces, sent AES-256. Set once, before any test runs, since it is a
	// package variable.
	pkcs7.ContentEncryptionAlgorithm = pkcs7.EncryptionAlgorithmAES256CBC
	harness.Main(m, harness.Shared)
}
