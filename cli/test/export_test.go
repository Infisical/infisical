package tests

import (
	"fmt"
	"testing"

	"github.com/bradleyjkemp/cupaloy/v2"
)

func TestUniversalAuth_ExportSecretsWithImports(t *testing.T) {
	MachineIdentityLoginCmd(t)
	SetupCli(t)

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "export", "--token", creds.UAAccessToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--silent")

	fmt.Printf("output: %v\n", output)

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestServiceToken_ExportSecretsWithImports(t *testing.T) {
	SetupCli(t)

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "export", "--token", creds.ServiceToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--silent")

	fmt.Printf("output: %v\n", output)

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestUniversalAuth_ExportSecretsWithoutImports(t *testing.T) {
	MachineIdentityLoginCmd(t)
	SetupCli(t)

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "export", "--token", creds.UAAccessToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--silent", "--include-imports=false")

	fmt.Printf("output: %v\n", output)

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestServiceToken_ExportSecretsWithoutImports(t *testing.T) {
	SetupCli(t)

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "export", "--token", creds.ServiceToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--silent", "--include-imports=false")

	fmt.Printf("output: %v\n", output)

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}
