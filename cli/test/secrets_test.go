package tests

import (
	"testing"

	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/bradleyjkemp/cupaloy/v2"
)

func TestServiceToken_SecretsGetWithImportsAndRecursiveCmd(t *testing.T) {
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
	MachineIdentityLoginCmd(t)

	output, _ := ExecuteCliCommand(FORMATTED_CLI_NAME, "secrets", "--token", creds.UAAccessToken, "--projectId", creds.ProjectID, "--env", "invalid-env", "--recursive", "--silent")

	// Use cupaloy to snapshot test the output
	err := cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}

}

func TestUserAuth_SecretsGetAll(t *testing.T) {
	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "secrets", "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--include-imports=false", "--silent")
	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}

	// explicitly called here because it should happen directly after successful secretsGetAll
	// testUserAuth_SecretsGetAllWithoutConnection(t)
}

func testUserAuth_SecretsGetAllWithoutConnection(t *testing.T) {
	originalConfigFile, err := util.GetConfigFile()
	if err != nil {
		t.Fatalf("error getting config file")
	}
	newConfigFile := originalConfigFile

	// set it to a URL that will always be unreachable
	newConfigFile.LoggedInUserDomain = "http://localhost:4999"
	util.WriteConfigFile(&newConfigFile)

	// restore config file
	defer util.WriteConfigFile(&originalConfigFile)

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "secrets", "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--include-imports=false", "--silent")
	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}
