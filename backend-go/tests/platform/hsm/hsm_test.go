//go:build integration

package hsm_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/ee/services/hsm"
	"github.com/infisical/api/tests/infra"
)

var runner = infra.NewContainerTest(
	"infisical/go-test-backend",
	"INFISICAL_HSM_TEST_INSIDE",
	"INFISICAL_RUN_HSM_CONTAINER_TEST",
).
	WithTestPath("./tests/platform/hsm/...").
	WithBuildTags("integration").
	WithEnv("SOFTHSM2_LIB", "/usr/lib/softhsm/libsofthsm2.so")

func TestMain(m *testing.M) {
	if runner.IsInsideContainer() {
		os.Exit(m.Run())
	}

	os.Exit(runner.MustRun())
}

// ============================================================================
// HSM tests (run inside the container)
// ============================================================================

func setupHSM(t *testing.T) *hsm.Service {
	t.Helper()

	if !runner.IsInsideContainer() {
		t.Skip("skipping: not inside test container")
	}

	libPath := os.Getenv("SOFTHSM2_LIB")
	require.NotEmpty(t, libPath, "SOFTHSM2_LIB not set")

	tokenDir := t.TempDir()
	confPath := filepath.Join(tokenDir, "softhsm2.conf")
	require.NoError(t, os.WriteFile(confPath, []byte(
		"directories.tokendir = "+tokenDir+"\nobjectstore.backend = file\n",
	), 0o644))
	t.Setenv("SOFTHSM2_CONF", confPath)

	cmd := exec.CommandContext(t.Context(), "softhsm2-util",
		"--init-token", "--free",
		"--label", "test-token",
		"--pin", "1234", "--so-pin", "5678",
	)
	cmd.Env = append(os.Environ(), "SOFTHSM2_CONF="+confPath)
	out, err := cmd.CombinedOutput()
	require.NoError(t, err, "softhsm2-util: "+string(out))

	svc, err := hsm.NewService(hsm.Config{
		LibPath:    libPath,
		TokenLabel: "test-token",
		Pin:        "1234",
		KeyLabel:   "test-infisical",
	})
	require.NoError(t, err)
	t.Cleanup(func() { svc.Close() })

	require.NoError(t, svc.StartService(true))

	return svc
}

func TestStartService_IsActive(t *testing.T) {
	svc := setupHSM(t)
	assert.True(t, svc.IsActive())
}

func TestEncrypt_RoundTrip(t *testing.T) {
	svc := setupHSM(t)

	plaintext := []byte("hello from the HSM")

	blob, err := svc.Encrypt(plaintext)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(blob), 16+16+32)

	got, err := svc.Decrypt(blob)
	require.NoError(t, err)
	assert.Equal(t, plaintext, got)
}

func TestEncrypt_EmptyData(t *testing.T) {
	svc := setupHSM(t)

	blob, err := svc.Encrypt([]byte{})
	require.NoError(t, err)

	got, err := svc.Decrypt(blob)
	require.NoError(t, err)
	assert.Equal(t, []byte{}, got)
}

func TestEncrypt_LargeData(t *testing.T) {
	svc := setupHSM(t)

	plaintext := make([]byte, 500)
	for i := range plaintext {
		plaintext[i] = byte(i % 256)
	}

	blob, err := svc.Encrypt(plaintext)
	require.NoError(t, err)

	got, err := svc.Decrypt(blob)
	require.NoError(t, err)
	assert.Equal(t, plaintext, got)
}

func TestDecrypt_TamperedHMAC(t *testing.T) {
	svc := setupHSM(t)

	blob, err := svc.Encrypt([]byte("tamper test"))
	require.NoError(t, err)

	blob[len(blob)-1] ^= 0xFF

	_, err = svc.Decrypt(blob)
	assert.Error(t, err)
}

func TestDecrypt_TamperedCiphertext(t *testing.T) {
	svc := setupHSM(t)

	blob, err := svc.Encrypt([]byte("tamper ciphertext"))
	require.NoError(t, err)

	blob[20] ^= 0xFF

	_, err = svc.Decrypt(blob)
	assert.Error(t, err)
}

func TestDecrypt_TamperedIV(t *testing.T) {
	svc := setupHSM(t)

	blob, err := svc.Encrypt([]byte("tamper iv"))
	require.NoError(t, err)

	blob[0] ^= 0xFF

	_, err = svc.Decrypt(blob)
	assert.Error(t, err)
}

func TestDecrypt_TooShort(t *testing.T) {
	svc := setupHSM(t)

	_, err := svc.Decrypt([]byte("short"))
	assert.Error(t, err)
}

func TestRandomBytes_ReturnsUniqueBytes(t *testing.T) {
	svc := setupHSM(t)

	a, err := svc.RandomBytes(32)
	require.NoError(t, err)
	assert.Len(t, a, 32)

	b, err := svc.RandomBytes(32)
	require.NoError(t, err)
	assert.Len(t, b, 32)

	assert.NotEqual(t, a, b)
}

func TestEncrypt_ProducesDifferentBlobs(t *testing.T) {
	svc := setupHSM(t)

	blob1, err := svc.Encrypt([]byte("same"))
	require.NoError(t, err)

	blob2, err := svc.Encrypt([]byte("same"))
	require.NoError(t, err)

	assert.NotEqual(t, blob1, blob2, "two encryptions of same data should differ due to random IV")
}
