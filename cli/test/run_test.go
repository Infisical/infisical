package tests

import (
	"bytes"
	"testing"

	"github.com/bradleyjkemp/cupaloy/v2"
)

func TestServiceToken_RunCmdRecursiveAndImports(t *testing.T) {
	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "run", "--token", creds.ServiceToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--recursive", "--silent", "--", "echo", "hello world")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	output = string(bytes.Split([]byte(output), []byte("INF"))[1])

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}
func TestServiceToken_RunCmdWithImports(t *testing.T) {
	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "run", "--token", creds.ServiceToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--silent", "--", "echo", "hello world")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	output = string(bytes.Split([]byte(output), []byte("INF"))[1])

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestUniversalAuth_RunCmdRecursiveAndImports(t *testing.T) {
	MachineIdentityLoginCmd(t)
	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "run", "--token", creds.UAAccessToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--recursive", "--silent", "--", "echo", "hello world")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	output = string(bytes.Split([]byte(output), []byte("INF"))[1])

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestUniversalAuth_RunCmdWithImports(t *testing.T) {
	MachineIdentityLoginCmd(t)
	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "run", "--token", creds.UAAccessToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--silent", "--", "echo", "hello world")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// remove the first few characters from the output because we don't care about the time, and it will change every time
	output = string(bytes.Split([]byte(output), []byte("INF"))[1])

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestUniversalAuth_RunCmdWithoutImports(t *testing.T) {
	MachineIdentityLoginCmd(t)
	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "run", "--token", creds.UAAccessToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--silent", "--include-imports=false", "--", "echo", "hello world")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	output = string(bytes.Split([]byte(output), []byte("INF"))[1])

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}

func TestServiceToken_RunCmdWithoutImports(t *testing.T) {
	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "run", "--token", creds.ServiceToken, "--projectId", creds.ProjectID, "--env", creds.EnvSlug, "--silent", "--include-imports=false", "--", "echo", "hello world")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	// Remove everything before "INF" because it's not relevant to the test
	output = string(bytes.Split([]byte(output), []byte("INF"))[1])

	// Use cupaloy to snapshot test the output
	err = cupaloy.Snapshot(output)
	if err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}
}
