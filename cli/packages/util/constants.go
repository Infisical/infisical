package util

const (
	CONFIG_FILE_NAME                           = "infisical-config.json"
	CONFIG_FOLDER_NAME                         = ".infisical"
	INFISICAL_DEFAULT_US_URL                   = "https://app.infisical.com"
	INFISICAL_DEFAULT_EU_URL                   = "https://eu.infisical.com"
	INFISICAL_WORKSPACE_CONFIG_FILE_NAME       = ".infisical.json"
	INFISICAL_TOKEN_NAME                       = "INFISICAL_TOKEN"
	INFISICAL_PROJECT_ID                       = "INFISICAL_PROJECT_ID"
	INFISICAL_UNIVERSAL_AUTH_ACCESS_TOKEN_NAME = "INFISICAL_UNIVERSAL_AUTH_ACCESS_TOKEN"
	INFISICAL_VAULT_FILE_PASSPHRASE_ENV_NAME   = "INFISICAL_VAULT_FILE_PASSPHRASE" // This works because we've forked the keyring package and added support for this env variable. This explains why you won't find any occurrences of it in the CLI codebase.

	// JWT configuration
	INFISICAL_JWT_EXPIRATION_NAME             = "INFISICAL_JWT_EXPIRATION"
	DEFAULT_JWT_EXPIRATION                    = 86400    // 24 hours in seconds
	MIN_JWT_EXPIRATION                        = 3600     // 1 hour in seconds
	MAX_JWT_EXPIRATION                        = 2592000  // 30 days in seconds

	VAULT_BACKEND_AUTO_MODE = "auto"
	VAULT_BACKEND_FILE_MODE = "file"

	// Universal Auth
	INFISICAL_UNIVERSAL_AUTH_CLIENT_ID_NAME     = "INFISICAL_UNIVERSAL_AUTH_CLIENT_ID"
	INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET_NAME = "INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET"

	// Kubernetes auth
	INFISICAL_KUBERNETES_SERVICE_ACCOUNT_TOKEN_NAME = "INFISICAL_KUBERNETES_SERVICE_ACCOUNT_TOKEN_PATH"

	// GCP Auth
	INFISICAL_GCP_IAM_SERVICE_ACCOUNT_KEY_FILE_PATH_NAME = "INFISICAL_GCP_IAM_SERVICE_ACCOUNT_KEY_FILE_PATH"

	// OIDC Auth
	INFISICAL_OIDC_AUTH_JWT_NAME = "INFISICAL_OIDC_AUTH_JWT"

	// Generic env variable used for auth methods that require a machine identity ID
	INFISICAL_MACHINE_IDENTITY_ID_NAME = "INFISICAL_MACHINE_IDENTITY_ID"

	SECRET_TYPE_PERSONAL      = "personal"
	SECRET_TYPE_SHARED        = "shared"
	KEYRING_SERVICE_NAME      = "infisical"
	PERSONAL_SECRET_TYPE_NAME = "personal"
	SHARED_SECRET_TYPE_NAME   = "shared"

	SERVICE_TOKEN_IDENTIFIER        = "service-token"
	UNIVERSAL_AUTH_TOKEN_IDENTIFIER = "universal-auth-token"

	INFISICAL_BACKUP_SECRET                = "infisical-backup-secrets" // akhilmhdh: @depreciated remove in version v0.30
	INFISICAL_BACKUP_SECRET_ENCRYPTION_KEY = "infisical-backup-secret-encryption-key"
)

var (
	CLI_VERSION = "devel"
)
