package tests

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func MachineIdentityLoginCmd(t *testing.T) {
	SetupCli(t)

	if creds.UAAccessToken != "" {
		return
	}

	jwtPattern := `^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$`

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "login", "--method=universal-auth", "--client-id", creds.ClientID, "--client-secret", creds.ClientSecret, "--plain", "--silent")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	assert.Regexp(t, jwtPattern, output)

	creds.UAAccessToken = output

	// We can't use snapshot testing here because the output will be different every time
}
