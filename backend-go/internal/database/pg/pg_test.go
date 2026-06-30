package pg

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/pem"
	"math/big"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// selfSignedCertBase64 generates a valid self-signed CA cert and returns it
// base64-encoded, matching the DB_ROOT_CERT format.
func selfSignedCertBase64(t *testing.T) string {
	t.Helper()

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generating key: %v", err)
	}

	template := x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "test-ca"},
		NotBefore:             time.Unix(0, 0),
		NotAfter:              time.Unix(0, 0).AddDate(10, 0, 0),
		IsCA:                  true,
		BasicConstraintsValid: true,
	}

	der, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("creating cert: %v", err)
	}

	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	return base64.StdEncoding.EncodeToString(pemBytes)
}

func sslModeParam(t *testing.T, uri string) string {
	t.Helper()
	parsed, err := url.Parse(uri)
	if err != nil {
		t.Fatalf("parsing result URI %q: %v", uri, err)
	}
	return parsed.Query().Get("sslmode")
}

// This is the exact failing case from the bug report: sslmode=no-verify with no
// root cert. pgx rejects "no-verify", so parseSslConfig must strip it.
func TestParseSslConfig_NoVerifyWithoutRootCert(t *testing.T) {
	uri := "postgres://infisical:secret@host.rds.amazonaws.com:5432/infisical?sslmode=no-verify"

	modifiedURI, tlsCfg, err := parseSslConfig(uri, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if got := sslModeParam(t, modifiedURI); got != "" {
		t.Fatalf("expected sslmode stripped, still present: %q (uri=%q)", got, modifiedURI)
	}
	if tlsCfg == nil {
		t.Fatal("expected a TLS config for no-verify, got nil")
	}
	if !tlsCfg.InsecureSkipVerify {
		t.Fatal("expected InsecureSkipVerify=true for no-verify")
	}
}

// Other valid libpq sslmodes are understood by pgx, so without a cert they must
// be left untouched (no TLS config, URI unchanged).
func TestParseSslConfig_OtherSslModeWithoutRootCert(t *testing.T) {
	for _, mode := range []string{"require", "prefer", "disable", "verify-full"} {
		uri := "postgres://u:p@host:5432/db?sslmode=" + mode

		modifiedURI, tlsCfg, err := parseSslConfig(uri, "")
		if err != nil {
			t.Fatalf("mode %q: unexpected error: %v", mode, err)
		}
		if modifiedURI != uri {
			t.Fatalf("mode %q: expected URI unchanged, got %q", mode, modifiedURI)
		}
		if tlsCfg != nil {
			t.Fatalf("mode %q: expected nil TLS config", mode)
		}
	}
}

func TestParseSslConfig_NoSslModeNoRootCert(t *testing.T) {
	uri := "postgres://u:p@host:5432/db"

	modifiedURI, tlsCfg, err := parseSslConfig(uri, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if modifiedURI != uri {
		t.Fatalf("expected URI unchanged, got %q", modifiedURI)
	}
	if tlsCfg != nil {
		t.Fatal("expected nil TLS config")
	}
}

// With a root cert, sslmode must be stripped and verification only enabled for
// verify-ca / verify-full.
func TestParseSslConfig_WithRootCert(t *testing.T) {
	cert := selfSignedCertBase64(t)

	cases := []struct {
		sslMode        string
		wantSkipVerify bool
		wantStripped   bool
	}{
		{"no-verify", true, true},
		{"require", true, true},
		{"verify-ca", false, true},
		{"verify-full", false, true},
		{"disable", true, false}, // disable: cert provided but TLS not forced via stripping
		{"", true, false},
	}

	for _, tc := range cases {
		uri := "postgres://u:p@host:5432/db"
		if tc.sslMode != "" {
			uri += "?sslmode=" + tc.sslMode
		}

		modifiedURI, tlsCfg, err := parseSslConfig(uri, cert)
		if err != nil {
			t.Fatalf("mode %q: unexpected error: %v", tc.sslMode, err)
		}
		if tlsCfg == nil {
			t.Fatalf("mode %q: expected TLS config when cert provided", tc.sslMode)
		}
		if tlsCfg.RootCAs == nil {
			t.Fatalf("mode %q: expected RootCAs populated from cert", tc.sslMode)
		}
		if tlsCfg.InsecureSkipVerify != tc.wantSkipVerify {
			t.Fatalf("mode %q: InsecureSkipVerify=%v, want %v", tc.sslMode, tlsCfg.InsecureSkipVerify, tc.wantSkipVerify)
		}
		if tc.wantStripped {
			if strings.Contains(modifiedURI, "sslmode=") {
				t.Fatalf("mode %q: expected sslmode stripped, got %q", tc.sslMode, modifiedURI)
			}
		} else if modifiedURI != uri {
			t.Fatalf("mode %q: expected URI unchanged, got %q", tc.sslMode, modifiedURI)
		}
	}
}

func TestParseSslConfig_InvalidRootCert(t *testing.T) {
	if _, _, err := parseSslConfig("postgres://u:p@host/db", "not-base64-!!!"); err == nil {
		t.Fatal("expected error for invalid base64 cert")
	}
	if _, _, err := parseSslConfig("postgres://u:p@host/db", base64.StdEncoding.EncodeToString([]byte("not a pem"))); err == nil {
		t.Fatal("expected error for non-PEM cert")
	}
}

// End-to-end check against pgx itself: the raw no-verify URI must fail
// ParseConfig (reproducing the bug), and the URI returned by parseSslConfig
// must parse cleanly.
func TestParseSslConfig_NoVerifyParsesWithPgx(t *testing.T) {
	uri := "postgres://infisical:secret@host.rds.amazonaws.com:5432/infisical?sslmode=no-verify"

	if _, err := pgxpool.ParseConfig(uri); err == nil {
		t.Fatal("expected raw no-verify URI to fail pgx ParseConfig (bug repro)")
	}

	modifiedURI, _, err := parseSslConfig(uri, "")
	if err != nil {
		t.Fatalf("parseSslConfig error: %v", err)
	}
	if strings.Contains(modifiedURI, "no-verify") {
		t.Fatalf("no-verify should be stripped before reaching pgx: %q", modifiedURI)
	}
	if _, err := pgxpool.ParseConfig(modifiedURI); err != nil {
		t.Fatalf("fixed URI should parse with pgx, got: %v", err)
	}
}
