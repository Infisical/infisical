package tests

import (
	"fmt"
	"testing"

	"github.com/bradleyjkemp/cupaloy/v2"
)

func TestServiceToken_RunCmdRecursiveAndImports(t *testing.T) {
	SetupCli(t)

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "run", "--token", creds.ServiceToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--recursive", "--silent", "--", "echo", "hello world")

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
func TestServiceToken_RunCmdWithImports(t *testing.T) {
	SetupCli(t)

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "run", "--token", creds.ServiceToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--silent", "--", "echo", "hello world")

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

func TestUniversalAuth_RunCmdRecursiveAndImports(t *testing.T) {
	MachineIdentityLoginCmd(t)
	SetupCli(t)

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "run", "--token", creds.UAAccessToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--recursive", "--silent", "--", "echo", "hello world")

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

func TestUniversalAuth_RunCmdWithImports(t *testing.T) {
	MachineIdentityLoginCmd(t)
	SetupCli(t)

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "run", "--token", creds.UAAccessToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--silent", "--", "echo", "hello world")

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

func TestUniversalAuth_RunCmdWithoutImports(t *testing.T) {
	MachineIdentityLoginCmd(t)
	SetupCli(t)

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "run", "--token", creds.UAAccessToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--silent", "--include-imports=false", "--", "echo", "hello world")

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

func TestServiceToken_RunCmdWithoutImports(t *testing.T) {
	SetupCli(t)

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "run", "--token", creds.ServiceToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--silent", "--include-imports=false", "--", "echo", "hello world")

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
