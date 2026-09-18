package kms

type KmsType string

const (
	KmsTypeExternal KmsType = "external"
	KmsTypeInternal KmsType = "internal"
)

type KmsKeyUsage string

const (
	EncryptDecrypt    KmsKeyUsage = "encrypt-decrypt"
	SignVerify        KmsKeyUsage = "sign-verify"
	GenerateVerifyMAC KmsKeyUsage = "generate-verify-mac"
)

type SymmetricKeyAlgorithm string

const (
	AESGCM256 SymmetricKeyAlgorithm = "aes-256-gcm"
	AESGCM128 SymmetricKeyAlgorithm = "aes-128-gcm"
)
