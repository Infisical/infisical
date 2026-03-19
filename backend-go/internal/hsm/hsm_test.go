package hsm_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/hsm"
)

// setupHSM initializes a SoftHSM2 token and returns a ready HSM service.
// Skips the test if SOFTHSM2_LIB is not set.
func setupHSM(t *testing.T) *hsm.Service {
	t.Helper()

	libPath := os.Getenv("SOFTHSM2_LIB")
	if libPath == "" {
		t.Skip("Skipping HSM tests: SOFTHSM2_LIB environment variable not set. Set it to the path of libsofthsm2.so to enable HSM tests.")
	}

	if _, err := exec.LookPath("softhsm2-util"); err != nil {
		t.Skip("Skipping HSM tests: softhsm2-util not found in PATH")
	}

	tokenDir := t.TempDir()
	confPath := filepath.Join(tokenDir, "softhsm2.conf")
	require.NoError(t, os.WriteFile(confPath, []byte(
		"directories.tokendir = "+tokenDir+"\nobjectstore.backend = file\n",
	), 0644))
	t.Setenv("SOFTHSM2_CONF", confPath)

	cmd := exec.Command("softhsm2-util",
		"--init-token", "--free",
		"--label", "test-token",
		"--pin", "1234", "--so-pin", "5678",
	)
	cmd.Env = append(os.Environ(), "SOFTHSM2_CONF="+confPath)
	out, err := cmd.CombinedOutput()
	require.NoError(t, err, "softhsm2-util: "+string(out))

	svc, err := hsm.NewService(hsm.Config{
		LibPath:  libPath,
		Slot:     0,
		Pin:      "1234",
		KeyLabel: "test-infisical",
	})
	require.NoError(t, err)
	t.Cleanup(func() { svc.Close() })

	require.NoError(t, svc.StartService())

	return svc
}

func TestStartServiceAndIsActive(t *testing.T) {
	svc := setupHSM(t)
	assert.True(t, svc.IsActive())
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	svc := setupHSM(t)

	plaintext := []byte("hello from the HSM")

	blob, err := svc.Encrypt(plaintext)
	require.NoError(t, err)

	// Verify blob structure: IV(16) + at least one padded block(16) + HMAC(32).
	assert.GreaterOrEqual(t, len(blob), 16+16+32)

	got, err := svc.Decrypt(blob)
	require.NoError(t, err)
	assert.Equal(t, plaintext, got)
}

func TestEncryptDecryptEmptyData(t *testing.T) {
	svc := setupHSM(t)

	blob, err := svc.Encrypt([]byte{})
	require.NoError(t, err)

	got, err := svc.Decrypt(blob)
	require.NoError(t, err)
	assert.Equal(t, []byte{}, got)
}

func TestEncryptDecryptLargeData(t *testing.T) {
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

func TestDecryptTamperedHMAC(t *testing.T) {
	svc := setupHSM(t)

	blob, err := svc.Encrypt([]byte("tamper test"))
	require.NoError(t, err)

	// Flip a byte in the HMAC region (last 32 bytes).
	blob[len(blob)-1] ^= 0xFF

	_, err = svc.Decrypt(blob)
	assert.Error(t, err)
}

func TestDecryptTamperedCiphertext(t *testing.T) {
	svc := setupHSM(t)

	blob, err := svc.Encrypt([]byte("tamper ciphertext"))
	require.NoError(t, err)

	// Flip a byte in the ciphertext region (after IV, before HMAC).
	blob[20] ^= 0xFF

	_, err = svc.Decrypt(blob)
	assert.Error(t, err)
}

func TestDecryptTamperedIV(t *testing.T) {
	svc := setupHSM(t)

	blob, err := svc.Encrypt([]byte("tamper iv"))
	require.NoError(t, err)

	// Flip a byte in the IV region.
	blob[0] ^= 0xFF

	_, err = svc.Decrypt(blob)
	assert.Error(t, err)
}

func TestDecryptTooShort(t *testing.T) {
	svc := setupHSM(t)

	_, err := svc.Decrypt([]byte("short"))
	assert.Error(t, err)
}

func TestRandomBytes(t *testing.T) {
	svc := setupHSM(t)

	a, err := svc.RandomBytes(32)
	require.NoError(t, err)
	assert.Len(t, a, 32)

	b, err := svc.RandomBytes(32)
	require.NoError(t, err)
	assert.Len(t, b, 32)

	assert.NotEqual(t, a, b)
}

func TestEncryptProducesDifferentBlobs(t *testing.T) {
	svc := setupHSM(t)

	blob1, err := svc.Encrypt([]byte("same"))
	require.NoError(t, err)

	blob2, err := svc.Encrypt([]byte("same"))
	require.NoError(t, err)

	assert.NotEqual(t, blob1, blob2, "two encryptions of same data should differ due to random IV")
}
