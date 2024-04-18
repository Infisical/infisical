package tests

import (
	"bytes"
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/Infisical/infisical-merge/packages/cmd"
	"github.com/stretchr/testify/assert"
)

func RunCmd(t *testing.T, authToken string, projectId string, envSlug string) {

	rootCommand := cmd.NewRootCmd()

	commandOutput := new(bytes.Buffer)
	errorOutput := new(bytes.Buffer)
	rootCommand.SetOut(commandOutput)
	rootCommand.SetErr(errorOutput)

	args := []string{
		"run",
	}

	args = append(args, fmt.Sprintf("--token=%s", authToken))
	args = append(args, fmt.Sprintf("--projectId=%s", projectId))
	args = append(args, fmt.Sprintf("--env=%s", envSlug))
	args = append(args, "--", "echo", "TEST_COMMAND_BEING_EXECUTED")

	rootCommand.SetArgs(args)
	rootCommand.Execute()

	var secrets []Secret

	stringSecrets := commandOutput.String()
	arraySecrets := strings.Split(stringSecrets, "\n")

	for idx, secret := range arraySecrets {
		if idx == len(arraySecrets)-1 && secret == "" {
			continue
		}

		secretParts := strings.Split(secret, "=")

		if len(secretParts) != 2 {
			t.Errorf("Error: secret at index %d is not formatted correctly", idx)
		}

		newSecret := Secret{
			Key:   secretParts[0],
			Value: secretParts[1],
		}

		// make sure the new secret key is at least one of the expected keys
		if !slices.Contains(ALL_SECRET_KEYS, newSecret.Key) {
			continue
		}

		secrets = append(secrets, newSecret)
	}

	expectedLength := len(DEV_SECRETS) + len(STAGING_SECRETS)

	assert.Len(t, secrets, expectedLength)

	for _, secret := range secrets {
		assert.Contains(t, ALL_SECRET_KEYS, secret.Key)
		assert.Contains(t, ALL_SECRET_VALUES, secret.Value)
	}
}

func RunCmdWithoutImportsAndWithRecursive(t *testing.T, authToken string, projectId string, envSlug string) {

	rootCommand := cmd.NewRootCmd()

	commandOutput := new(bytes.Buffer)
	errorOutput := new(bytes.Buffer)
	rootCommand.SetOut(commandOutput)
	rootCommand.SetErr(errorOutput)

	args := []string{
		"run",
	}

	args = append(args, fmt.Sprintf("--token=%s", authToken))
	args = append(args, fmt.Sprintf("--projectId=%s", projectId))
	args = append(args, fmt.Sprintf("--env=%s", envSlug))
	args = append(args, "--include-imports=false")
	args = append(args, "--recursive")
	args = append(args, "--", "echo", "TEST_COMMAND_BEING_EXECUTED_RECURSIVE")

	rootCommand.SetArgs(args)
	rootCommand.Execute()

	var secrets []Secret

	stringSecrets := commandOutput.String()
	arraySecrets := strings.Split(stringSecrets, "\n")

	for idx, secret := range arraySecrets {
		if idx == len(arraySecrets)-1 && secret == "" {
			continue
		}

		secretParts := strings.Split(secret, "=")

		if len(secretParts) != 2 {
			t.Errorf("Error: secret at index %d is not formatted correctly", idx)
		}

		newSecret := Secret{
			Key:   secretParts[0],
			Value: secretParts[1],
		}

		// make sure the new secret key is at least one of the expected keys
		if !slices.Contains(ALL_SECRET_KEYS, newSecret.Key) {
			continue
		}

		secrets = append(secrets, newSecret)
	}

	nestedDevSecrets := append(DEV_FOLDER_SECRETS, DEV_SECRETS...)
	nestedDevSecretsKeys := Map(nestedDevSecrets, func(secret Secret) string { return secret.Key })
	nestedDevSecretsValues := Map(nestedDevSecrets, func(secret Secret) string { return secret.Value })

	expectedLength := len(nestedDevSecrets)
	assert.Len(t, secrets, expectedLength)

	for _, secret := range secrets {
		assert.Contains(t, nestedDevSecretsKeys, secret.Key)
		assert.Contains(t, nestedDevSecretsValues, secret.Value)
	}
}
