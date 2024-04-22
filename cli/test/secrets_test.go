package tests

import (
	"testing"

	"github.com/bradleyjkemp/cupaloy/v2"
)

func TestServiceToken_SecretsGetWithImportsAndRecursiveCmd(t *testing.T) {
	SetupCli(t)

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "secrets", "--token", creds.ServiceToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--recursive", "--silent")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestServiceToken_SecretsGetWithoutImportsAndWithoutRecursiveCmd(t *testing.T) {
	SetupCli(t)

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "secrets", "--token", creds.ServiceToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--include-imports=false", "--silent")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestUniversalAuth_SecretsGetWithImportsAndRecursiveCmd(t *testing.T) {
	SetupCli(t)
	MachineIdentityLoginCmd(t)

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "secrets", "--token", creds.UAAccessToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--recursive", "--silent")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestUniversalAuth_SecretsGetWithoutImportsAndWithoutRecursiveCmd(t *testing.T) {
	SetupCli(t)
	MachineIdentityLoginCmd(t)

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "secrets", "--token", creds.UAAccessToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--include-imports=false", "--silent")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestUniversalAuth_SecretsGetWrongEnvironment(t *testing.T) {
	SetupCli(t)
	MachineIdentityLoginCmd(t)

	output, _ := ExecuteCliCommand(FORMATTED_CLI_NAME, "secrets", "--token", creds.UAAccessToken, "--projectId", creds.ProjectID, "--env", "invalid-env", "--recursive", "--silent")

	// Use cupaloy to snapshot test the output
	err := cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}

}
