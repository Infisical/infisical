package constants

const SERVICE_ACCOUNT_ACCESS_KEY = "serviceAccountAccessKey"
const SERVICE_ACCOUNT_PUBLIC_KEY = "serviceAccountPublicKey"
const SERVICE_ACCOUNT_PRIVATE_KEY = "serviceAccountPrivateKey"

const INFISICAL_MACHINE_IDENTITY_CLIENT_ID = "clientId"
const INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET = "clientSecret"

const INFISICAL_TOKEN_SECRET_KEY_NAME = "infisicalToken"
const SECRET_VERSION_ANNOTATION = "secrets.infisical.com/version" // used to set the version of secrets via Etag
const OPERATOR_SETTINGS_CONFIGMAP_NAME = "infisical-config"
const OPERATOR_SETTINGS_CONFIGMAP_NAMESPACE = "infisical-operator-system"
const INFISICAL_DOMAIN = "https://app.infisical.com/api"

const INFISICAL_PUSH_SECRET_FINALIZER_NAME = "infisical.secrets.infisical.com/finalizer"

type PushSecretReplacePolicy string
type PushSecretDeletionPolicy string

const (
	PUSH_SECRET_REPLACE_POLICY_ENABLED PushSecretReplacePolicy  = "Replace"
	PUSH_SECRET_DELETE_POLICY_ENABLED  PushSecretDeletionPolicy = "Delete"
)
