package sign_test

import (
	"testing"

	"github.com/infisical/api/internal/crypto/sign"
)

func TestRSAGenerateAndPublicKey(t *testing.T) {
	privPEM, err := sign.GeneratePrivateKey(sign.RSA4096)
	if err != nil {
		t.Fatalf("GeneratePrivateKey(RSA4096): %v", err)
	}

	pubDER, err := sign.PublicKeyFromPrivate(privPEM)
	if err != nil {
		t.Fatalf("PublicKeyFromPrivate: %v", err)
	}

	if len(pubDER) == 0 {
		t.Fatal("public key DER is empty")
	}
}

func TestECCGenerateAndPublicKey(t *testing.T) {
	privPEM, err := sign.GeneratePrivateKey(sign.ECCP256)
	if err != nil {
		t.Fatalf("GeneratePrivateKey(ECCP256): %v", err)
	}

	pubDER, err := sign.PublicKeyFromPrivate(privPEM)
	if err != nil {
		t.Fatalf("PublicKeyFromPrivate: %v", err)
	}

	if len(pubDER) == 0 {
		t.Fatal("public key DER is empty")
	}
}

func TestRSAPKCS1SignVerify(t *testing.T) {
	privPEM, _ := sign.GeneratePrivateKey(sign.RSA4096)
	pubDER, _ := sign.PublicKeyFromPrivate(privPEM)
	data := []byte("hello KMS")

	for _, algo := range []sign.SigningAlgorithm{
		sign.RSASSA_PKCS1_V1_5_SHA256,
		sign.RSASSA_PKCS1_V1_5_SHA384,
		sign.RSASSA_PKCS1_V1_5_SHA512,
	} {
		sig, err := sign.Sign(data, privPEM, algo, false)
		if err != nil {
			t.Fatalf("Sign(%s): %v", algo, err)
		}

		ok, err := sign.Verify(data, sig, pubDER, algo, false)
		if err != nil {
			t.Fatalf("Verify(%s): %v", algo, err)
		}
		if !ok {
			t.Fatalf("Verify(%s) returned false", algo)
		}

		// Wrong data should fail.
		ok, err = sign.Verify([]byte("wrong"), sig, pubDER, algo, false)
		if err != nil {
			t.Fatalf("Verify(%s) with wrong data: %v", algo, err)
		}
		if ok {
			t.Fatalf("Verify(%s) should have returned false for wrong data", algo)
		}
	}
}

func TestRSAPSSSignVerify(t *testing.T) {
	privPEM, _ := sign.GeneratePrivateKey(sign.RSA4096)
	pubDER, _ := sign.PublicKeyFromPrivate(privPEM)
	data := []byte("PSS test")

	for _, algo := range []sign.SigningAlgorithm{
		sign.RSASSA_PSS_SHA256,
		sign.RSASSA_PSS_SHA384,
		sign.RSASSA_PSS_SHA512,
	} {
		sig, err := sign.Sign(data, privPEM, algo, false)
		if err != nil {
			t.Fatalf("Sign(%s): %v", algo, err)
		}

		ok, err := sign.Verify(data, sig, pubDER, algo, false)
		if err != nil {
			t.Fatalf("Verify(%s): %v", algo, err)
		}
		if !ok {
			t.Fatalf("Verify(%s) returned false", algo)
		}
	}
}

func TestRSAPSSRejectsDigest(t *testing.T) {
	privPEM, _ := sign.GeneratePrivateKey(sign.RSA4096)

	_, err := sign.Sign([]byte("data"), privPEM, sign.RSASSA_PSS_SHA256, true)
	if err == nil {
		t.Fatal("expected RSA-PSS to reject isDigest=true")
	}
}

func TestECDSASignVerify(t *testing.T) {
	privPEM, _ := sign.GeneratePrivateKey(sign.ECCP256)
	pubDER, _ := sign.PublicKeyFromPrivate(privPEM)
	data := []byte("ECDSA test")

	for _, algo := range []sign.SigningAlgorithm{
		sign.ECDSA_SHA256,
		sign.ECDSA_SHA384,
		sign.ECDSA_SHA512,
	} {
		sig, err := sign.Sign(data, privPEM, algo, false)
		if err != nil {
			t.Fatalf("Sign(%s): %v", algo, err)
		}

		ok, err := sign.Verify(data, sig, pubDER, algo, false)
		if err != nil {
			t.Fatalf("Verify(%s): %v", algo, err)
		}
		if !ok {
			t.Fatalf("Verify(%s) returned false", algo)
		}
	}
}

func TestAlgorithmKeyMismatch(t *testing.T) {
	rsaKey, _ := sign.GeneratePrivateKey(sign.RSA4096)
	ecKey, _ := sign.GeneratePrivateKey(sign.ECCP256)

	// RSA key with ECDSA algorithm.
	_, err := sign.Sign([]byte("data"), rsaKey, sign.ECDSA_SHA256, false)
	if err == nil {
		t.Fatal("expected error for RSA key with ECDSA algorithm")
	}

	// ECC key with RSA algorithm.
	_, err = sign.Sign([]byte("data"), ecKey, sign.RSASSA_PKCS1_V1_5_SHA256, false)
	if err == nil {
		t.Fatal("expected error for ECC key with RSA algorithm")
	}
}

func TestDigestSignVerify(t *testing.T) {
	privPEM, _ := sign.GeneratePrivateKey(sign.RSA4096)
	pubDER, _ := sign.PublicKeyFromPrivate(privPEM)

	// Pre-compute a SHA-256 digest (32 bytes).
	digest := make([]byte, 32)
	copy(digest, "this is a 32 byte fake digest!..")

	sig, err := sign.Sign(digest, privPEM, sign.RSASSA_PKCS1_V1_5_SHA256, true)
	if err != nil {
		t.Fatalf("Sign with digest: %v", err)
	}

	ok, err := sign.Verify(digest, sig, pubDER, sign.RSASSA_PKCS1_V1_5_SHA256, true)
	if err != nil {
		t.Fatalf("Verify with digest: %v", err)
	}
	if !ok {
		t.Fatal("Verify with digest returned false")
	}
}

func TestUnsupportedAlgorithm(t *testing.T) {
	privPEM, _ := sign.GeneratePrivateKey(sign.RSA4096)

	_, err := sign.Sign([]byte("data"), privPEM, "INVALID_ALGO", false)
	if err == nil {
		t.Fatal("expected error for unsupported algorithm")
	}
}

func TestUnsupportedKeyAlgorithm(t *testing.T) {
	_, err := sign.GeneratePrivateKey("DSA_2048")
	if err == nil {
		t.Fatal("expected error for unsupported key algorithm")
	}
}
