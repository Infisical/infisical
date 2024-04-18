package tests

import (
	"os"
	"testing"
)

var DEV_SECRETS = []Secret{
	{
		Key:   "TEST-SECRET-1",
		Value: "test-value-1",
	},
	{
		Key:   "TEST-SECRET-2",
		Value: "test-value-2",
	},
	{
		Key:   "TEST-SECRET-3",
		Value: "test-value-3",
	},
}

var DEV_FOLDER_SECRETS = []Secret{
	{
		Key:   "FOLDER-SECRET-1",
		Value: "folder-value-1",
	},
}

var STAGING_SECRETS = []Secret{
	{
		Key:   "STAGING-SECRET-1",
		Value: "staging-value-1",
	},
	{
		Key:   "STAGING-SECRET-2",
		Value: "staging-value-2",
	},
}

// Initialize the combined secrets array
var ALL_SECRETS = []Secret{}
var ALL_SECRET_KEYS = []string{}
var ALL_SECRET_VALUES = []string{}

type Credentials struct {
	ClientID      string
	ClientSecret  string
	UAAccessToken string
	ServiceToken  string
	ProjectID     string
	EnvSlug       string
}

var creds = Credentials{
	UAAccessToken: "",
	ClientID:      os.Getenv("CLI_TESTS_UA_CLIENT_ID"),
	ClientSecret:  os.Getenv("CLI_TESTS_UA_CLIENT_SECRET"),
	ServiceToken:  os.Getenv("CLI_TESTS_SERVICE_TOKEN"),
	ProjectID:     os.Getenv("CLI_TESTS_PROJECT_ID"),
	EnvSlug:       os.Getenv("CLI_TESTS_ENV_SLUG"),
}

func initialize() {
	if creds.ClientID == "" || creds.ClientSecret == "" || creds.ServiceToken == "" || creds.ProjectID == "" || creds.EnvSlug == "" {
		panic("Missing required environment variables")
	}

	ALL_SECRETS = append(ALL_SECRETS, DEV_SECRETS...)
	ALL_SECRETS = append(ALL_SECRETS, DEV_FOLDER_SECRETS...)
	ALL_SECRETS = append(ALL_SECRETS, STAGING_SECRETS...)

	for _, secret := range ALL_SECRETS {
		ALL_SECRET_KEYS = append(ALL_SECRET_KEYS, secret.Key)
		ALL_SECRET_VALUES = append(ALL_SECRET_VALUES, secret.Value)
	}
}

func Test_RunTests(t *testing.T) {
	initialize()

	t.Run("User login command", func(t *testing.T) {
		UALoginCmd(t)
	})

	t.Run("Run command", func(t *testing.T) {
		RunCmd(t, creds.UAAccessToken, creds.ProjectID, creds.EnvSlug)
		RunCmd(t, creds.ServiceToken, creds.ProjectID, creds.EnvSlug)
	})

	t.Run("Run Command (without imports, with recursive)", func(t *testing.T) {
		RunCmdWithoutImportsAndWithRecursive(t, creds.UAAccessToken, creds.ProjectID, creds.EnvSlug)
		RunCmdWithoutImportsAndWithRecursive(t, creds.ServiceToken, creds.ProjectID, creds.EnvSlug)
	})

	t.Run("Export secrets", func(t *testing.T) {
		ExportSecrets(t, creds.UAAccessToken, creds.ProjectID, creds.EnvSlug)
		ExportSecrets(t, creds.ServiceToken, creds.ProjectID, creds.EnvSlug)
	})

	t.Run("Export secrets (without imports)", func(t *testing.T) {
		ExportSecretsWithoutImports(t, creds.UAAccessToken, creds.ProjectID, creds.EnvSlug)
		ExportSecretsWithoutImports(t, creds.ServiceToken, creds.ProjectID, creds.EnvSlug)
	})

	t.Run("List Secrets (with imports and recursive)", func(t *testing.T) {
		ListSecretsWithImportsAndRecursive(t, creds.UAAccessToken, creds.ProjectID, creds.EnvSlug)
		ListSecretsWithImportsAndRecursive(t, creds.ServiceToken, creds.ProjectID, creds.EnvSlug)
	})

	t.Run("Get Secrets by Names", func(t *testing.T) {
		GetSecretsByNames(t, creds.UAAccessToken, creds.ProjectID, creds.EnvSlug)
		GetSecretsByNames(t, creds.ServiceToken, creds.ProjectID, creds.EnvSlug)
	})
}
