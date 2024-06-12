package tests

import (
	"testing"

	"github.com/bradleyjkemp/cupaloy/v2"
)

func TestServiceToken_GetSecretsByNameRecursive(t *testing.T) {
	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "secrets", "get", "TEST-SECRET-1", "TEST-SECRET-2", "FOLDER-SECRET-1", "--token", creds.ServiceToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--recursive", "--silent")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestServiceToken_GetSecretsByNameWithNotFoundSecret(t *testing.T) {
	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "secrets", "get", "TEST-SECRET-1", "TEST-SECRET-2", "FOLDER-SECRET-1", "DOES-NOT-EXIST", "--token", creds.ServiceToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--recursive", "--silent")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestServiceToken_GetSecretsByNameWithImports(t *testing.T) {
	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "secrets", "get", "TEST-SECRET-1", "STAGING-SECRET-2", "FOLDER-SECRET-1", "--token", creds.ServiceToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--recursive", "--silent")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestUniversalAuth_GetSecretsByNameRecursive(t *testing.T) {
	MachineIdentityLoginCmd(t)
	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "secrets", "get", "TEST-SECRET-1", "TEST-SECRET-2", "FOLDER-SECRET-1", "--token", creds.UAAccessToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--recursive", "--silent")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestUniversalAuth_GetSecretsByNameWithNotFoundSecret(t *testing.T) {
	MachineIdentityLoginCmd(t)
	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "secrets", "get", "TEST-SECRET-1", "TEST-SECRET-2", "FOLDER-SECRET-1", "DOES-NOT-EXIST", "--token", creds.UAAccessToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--recursive", "--silent")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestUniversalAuth_GetSecretsByNameWithImports(t *testing.T) {
	MachineIdentityLoginCmd(t)
	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "secrets", "get", "TEST-SECRET-1", "STAGING-SECRET-2", "FOLDER-SECRET-1", "--token", creds.UAAccessToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--recursive", "--silent")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}
