package tests

import (
	"bytes"
	"fmt"
	"regexp"
	"testing"

	"github.com/Infisical/infisical-merge/packages/cmd"
	"github.com/stretchr/testify/assert"
)

func UALoginCmd(t *testing.T) {
	jwtPattern := `^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$`

	rootCommand := cmd.NewRootCmd()

	commandOutput := new(bytes.Buffer)
	errorOutput := new(bytes.Buffer)
	rootCommand.SetOut(commandOutput)
	rootCommand.SetErr(errorOutput)

	args := []string{
		"login",
	}

	args = append(args, fmt.Sprintf("--method=%s", "universal-auth"))
	args = append(args, fmt.Sprintf("--client-id=%s", creds.ClientID))
	args = append(args, fmt.Sprintf("--client-secret=%s", creds.ClientSecret))

	rootCommand.SetArgs(args)
	rootCommand.Execute()

	token := commandOutput.String()

	// We do a match and compare it against true, instead of using assert.Regexp.
	// If the assertion fails, we would be able to see the potential token that was generated in the output console, which would be bad if running in a CI/CD pipeline.
	match, err := regexp.MatchString(jwtPattern, token)
	assert.Nil(t, err)
	assert.True(t, match, "The token does not match the pattern")

	creds.UAAccessToken = token
}
