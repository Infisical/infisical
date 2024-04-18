package tests

import (
	"bytes"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/Infisical/infisical-merge/packages/cmd"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/stretchr/testify/assert"
)

func ExportSecrets(t *testing.T, authToken string, projectId string, envSlug string) {

	rootCommand := cmd.NewRootCmd()

	commandOutput := new(bytes.Buffer)
	errorOutput := new(bytes.Buffer)
	rootCommand.SetOut(commandOutput)
	rootCommand.SetErr(errorOutput)

	args := []string{
		"export",
	}

	args = append(args, fmt.Sprintf("--token=%s", authToken))
	args = append(args, fmt.Sprintf("--projectId=%s", projectId))
	args = append(args, fmt.Sprintf("--env=%s", envSlug))

	rootCommand.SetArgs(args)
	rootCommand.Execute()

	var secrets []models.SingleEnvironmentVariable

	err := json.Unmarshal(commandOutput.Bytes(), &secrets)
	if err != nil {
		t.Errorf("Error: %v", err)
	}

	expectedLength := len(DEV_SECRETS) + len(STAGING_SECRETS)

	assert.Len(t, secrets, expectedLength)

	for _, secret := range secrets {
		if secret.Key == "FOLDER-SECRET-1" {
			continue
		}
		assert.Contains(t, ALL_SECRET_KEYS, secret.Key)
		assert.Contains(t, ALL_SECRET_VALUES, secret.Value)
	}
}

func ExportSecretsWithoutImports(t *testing.T, authToken string, projectId string, envSlug string) {

	rootCommand := cmd.NewRootCmd()

	commandOutput := new(bytes.Buffer)
	rootCommand.SetOut(commandOutput)
	rootCommand.SetErr(commandOutput)

	args := []string{
		"export",
	}

	args = append(args, fmt.Sprintf("--token=%s", authToken))
	args = append(args, fmt.Sprintf("--projectId=%s", projectId))
	args = append(args, fmt.Sprintf("--env=%s", envSlug))
	args = append(args, "--include-imports=false")

	rootCommand.SetArgs(args)
	rootCommand.Execute()

	var secrets []models.SingleEnvironmentVariable

	err := json.Unmarshal(commandOutput.Bytes(), &secrets)
	if err != nil {
		t.Errorf("Error: %v", err)
	}

	assert.Len(t, secrets, len(DEV_SECRETS))

	allDevSecretKeys, allDevSecretValues := getSecretKeysAndValues(DEV_SECRETS)

	for _, secret := range secrets {
		assert.Contains(t, allDevSecretKeys, secret.Key)
		assert.Contains(t, allDevSecretValues, secret.Value)
	}

}
