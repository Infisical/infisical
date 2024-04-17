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

func ListSecretsWithImportsAndRecursive(t *testing.T, authToken string, projectId string, envSlug string) {

	rootCommand := cmd.NewRootCmd()

	commandOutput := new(bytes.Buffer)
	rootCommand.SetOut(commandOutput)
	rootCommand.SetErr(commandOutput)

	args := []string{
		"secrets",
	}
	args = append(args, fmt.Sprintf("--token=%s", authToken))
	args = append(args, fmt.Sprintf("--projectId=%s", projectId))
	args = append(args, fmt.Sprintf("--env=%s", envSlug))
	args = append(args, "--include-imports=true")
	args = append(args, "--recursive=true")

	rootCommand.SetArgs(args)
	rootCommand.Execute()

	var secrets []models.SingleEnvironmentVariable

	err := json.Unmarshal(commandOutput.Bytes(), &secrets)
	if err != nil {
		t.Errorf("Error: %v", err)
	}

	if len(secrets) == 0 {
		t.Errorf("No secrets found")
	}

	secretKeys := []string{}
	secretValues := []string{}

	for _, secret := range secrets {
		secretKeys = append(secretKeys, secret.Key)
		secretValues = append(secretValues, secret.Value)
	}

	// Secrets can have different order and potentially more secrets. but the secrets should at least contain the above secrets.
	for _, key := range ALL_SECRET_KEYS {
		assert.Contains(t, secretKeys, key)
	}
	for _, value := range ALL_SECRET_VALUES {
		assert.Contains(t, secretValues, value)
	}
}

func GetSecretsByNames(t *testing.T, authToken string, projectId string, envSlug string) {

	rootCommand := cmd.NewRootCmd()

	commandOutput := new(bytes.Buffer)
	rootCommand.SetOut(commandOutput)
	rootCommand.SetErr(commandOutput)

	args := []string{
		"secrets",
		"get",
	}

	args = append(args, ALL_SECRET_KEYS...)
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

	assert.Len(t, secrets, len(ALL_SECRETS))

	for _, secret := range secrets {
		assert.Contains(t, ALL_SECRET_KEYS, secret.Key)

		if secret.Key == "FOLDER-SECRET-1" {
			assert.Equal(t, secret.Value, "*not found*") // Should not be found because recursive isn't enabled in this test, and the default path is "/"
		}
	}
}
