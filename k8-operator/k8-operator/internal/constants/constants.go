package constants

import "errors"

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

const INFISICAL_PUSH_SECRET_FINALIZER_NAME = "pushsecret.secrets.infisical.com/finalizer"
const INFISICAL_DYNAMIC_SECRET_FINALIZER_NAME = "dynamicsecret.secrets.infisical.com/finalizer"

type PushSecretReplacePolicy string
type PushSecretDeletionPolicy string

const (
	PUSH_SECRET_REPLACE_POLICY_ENABLED PushSecretReplacePolicy  = "Replace"
	PUSH_SECRET_DELETE_POLICY_ENABLED  PushSecretDeletionPolicy = "Delete"
)

type ManagedKubeResourceType string

const (
	MANAGED_KUBE_RESOURCE_TYPE_SECRET     ManagedKubeResourceType = "Secret"
	MANAGED_KUBE_RESOURCE_TYPE_CONFIG_MAP ManagedKubeResourceType = "ConfigMap"
)

type DynamicSecretLeaseRevocationPolicy string

const (
	DYNAMIC_SECRET_LEASE_REVOCATION_POLICY_ENABLED DynamicSecretLeaseRevocationPolicy = "Revoke"
)

var ErrInvalidLease = errors.New("invalid dynamic secret lease")
