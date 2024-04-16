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
	rootCommand.SetOut(commandOutput)
	rootCommand.SetErr(commandOutput)

	args := []string{
		"export",
	}

	args = append(args, fmt.Sprintf("--token=%s", authToken))
	args = append(args, fmt.Sprintf("--projectId=%s", projectId))

	rootCommand.SetArgs(args)
	rootCommand.Execute()

	var secrets []models.SingleEnvironmentVariable

	json.Unmarshal(commandOutput.Bytes(), &secrets)

	expectedLength := len(ALL_SECRETS) - 1 // -1 because the default path is "/", and the secret in /folder will not be found.

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
	args = append(args, "--include-imports=false")

	rootCommand.SetArgs(args)
	rootCommand.Execute()

	var secrets []models.SingleEnvironmentVariable

	json.Unmarshal(commandOutput.Bytes(), &secrets)

	assert.Len(t, secrets, len(DEV_SECRETS))

	allDevSecretKeys, allDevSecretValues := getSecretKeysAndValues(DEV_SECRETS)

	for _, secret := range secrets {
		assert.Contains(t, allDevSecretKeys, secret.Key)
		assert.Contains(t, allDevSecretValues, secret.Value)
	}

}
