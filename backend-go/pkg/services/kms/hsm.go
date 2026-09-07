package kms

// HsmService defines the HSM operations needed by the KMS service.
// Pass nil when HSM is not configured.
type HsmService interface {
	IsActive() bool
	Encrypt(data []byte) ([]byte, error)
	Decrypt(blob []byte) ([]byte, error)
	RandomBytes(n int) ([]byte, error)
}
