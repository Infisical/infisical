package scep_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/smallstep/pkcs7"
)

func TestMain(m *testing.M) {
	// The library defaults to DES-CBC and SHA-1. Infisical refuses DES, and sscep, which
	// this suite replaces, sent AES-256 signed with SHA-256 (-E aes256 -S sha256). Set
	// once, before any test runs, since both are package state.
	pkcs7.ContentEncryptionAlgorithm = pkcs7.EncryptionAlgorithmAES256CBC
	if err := pkcs7.SetDefaultDigestAlgorithm(pkcs7.OIDDigestAlgorithmSHA256); err != nil {
		panic(err)
	}
	harness.Main(m, harness.Shared)
}
