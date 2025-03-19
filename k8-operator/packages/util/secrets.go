package util

import (
	"fmt"
	"strings"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/api"
	"github.com/Infisical/infisical/k8-operator/packages/model"
	"github.com/go-resty/resty/v2"
	infisical "github.com/infisical/go-sdk"
)

type DecodedSymmetricEncryptionDetails = struct {
	Cipher []byte
	IV     []byte
	Tag    []byte
	Key    []byte
}

func VerifyServiceToken(serviceToken string) (string, error) {
	serviceTokenParts := strings.SplitN(serviceToken, ".", 4)
	if len(serviceTokenParts) < 4 {
		return "", fmt.Errorf("invalid service token entered. Please double check your service token and try again")
	}

	serviceToken = fmt.Sprintf("%v.%v.%v", serviceTokenParts[0], serviceTokenParts[1], serviceTokenParts[2])
	return serviceToken, nil
}

func GetServiceTokenDetails(infisicalToken string) (api.GetServiceTokenDetailsResponse, error) {
	serviceTokenParts := strings.SplitN(infisicalToken, ".", 4)
	if len(serviceTokenParts) < 4 {
		return api.GetServiceTokenDetailsResponse{}, fmt.Errorf("invalid service token entered. Please double check your service token and try again")
	}

	serviceToken := fmt.Sprintf("%v.%v.%v", serviceTokenParts[0], serviceTokenParts[1], serviceTokenParts[2])

	httpClient := resty.New()
	httpClient.SetAuthToken(serviceToken).
		SetHeader("Accept", "application/json")

	serviceTokenDetails, err := api.CallGetServiceTokenDetailsV2(httpClient)
	if err != nil {
		return api.GetServiceTokenDetailsResponse{}, fmt.Errorf("unable to get service token details. [err=%v]", err)
	}

	return serviceTokenDetails, nil
}

func GetPlainTextSecretsViaMachineIdentity(infisicalClient infisical.InfisicalClientInterface, secretScope v1alpha1.MachineIdentityScopeInWorkspace) ([]model.SingleEnvironmentVariable, error) {

	secrets, err := infisicalClient.Secrets().List(infisical.ListSecretsOptions{
		ProjectSlug:            secretScope.ProjectSlug,
		Environment:            secretScope.EnvSlug,
		Recursive:              secretScope.Recursive,
		SecretPath:             secretScope.SecretsPath,
		IncludeImports:         true,
		ExpandSecretReferences: true,
	})

	if err != nil {
		return nil, fmt.Errorf("unable to get secrets. [err=%v]", err)
	}

	var environmentVariables []model.SingleEnvironmentVariable

	for _, secret := range secrets {

		environmentVariables = append(environmentVariables, model.SingleEnvironmentVariable{
			Key:        secret.SecretKey,
			Value:      secret.SecretValue,
			Type:       secret.Type,
			ID:         secret.ID,
			SecretPath: secret.SecretPath,
		})
	}

	return environmentVariables, nil
}

func GetPlainTextSecretsViaServiceToken(infisicalClient infisical.InfisicalClientInterface, fullServiceToken string, envSlug string, secretPath string, recursive bool) ([]model.SingleEnvironmentVariable, error) {
	serviceTokenParts := strings.SplitN(fullServiceToken, ".", 4)
	if len(serviceTokenParts) < 4 {
		return nil, fmt.Errorf("invalid service token entered. Please double check your service token and try again")
	}

	serviceToken := fmt.Sprintf("%v.%v.%v", serviceTokenParts[0], serviceTokenParts[1], serviceTokenParts[2])

	httpClient := resty.New()

	httpClient.SetAuthToken(serviceToken).
		SetHeader("Accept", "application/json")

	serviceTokenDetails, err := api.CallGetServiceTokenDetailsV2(httpClient)
	if err != nil {
		return nil, fmt.Errorf("unable to get service token details. [err=%v]", err)
	}

	secrets, err := infisicalClient.Secrets().List(infisical.ListSecretsOptions{
		ProjectID:              serviceTokenDetails.Workspace,
		Environment:            envSlug,
		Recursive:              recursive,
		SecretPath:             secretPath,
		IncludeImports:         true,
		ExpandSecretReferences: true,
	})

	if err != nil {
		return nil, err
	}

	var environmentVariables []model.SingleEnvironmentVariable

	for _, secret := range secrets {

		environmentVariables = append(environmentVariables, model.SingleEnvironmentVariable{
			Key:        secret.SecretKey,
			Value:      secret.SecretValue,
			Type:       secret.Type,
			ID:         secret.ID,
			SecretPath: secret.SecretPath,
		})
	}

	return environmentVariables, nil

}

// Fetches plaintext secrets from an API endpoint using a service account.
// The function fetches the service account details and keys, decrypts the workspace key, fetches the encrypted secrets for the specified project and environment, and decrypts the secrets using the decrypted workspace key.
// Returns the plaintext secrets, encrypted secrets response, and any errors that occurred during the process.
func GetPlainTextSecretsViaServiceAccount(infisicalClient infisical.InfisicalClientInterface, serviceAccountCreds model.ServiceAccountDetails, projectId string, environmentName string) ([]model.SingleEnvironmentVariable, error) {
	httpClient := resty.New()
	httpClient.SetAuthToken(serviceAccountCreds.AccessKey).
		SetHeader("Accept", "application/json")

	serviceAccountDetails, err := api.CallGetServiceTokenAccountDetailsV2(httpClient)
	if err != nil {
		return nil, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to get service account details. [err=%v]", err)
	}

	serviceAccountKeys, err := api.CallGetServiceAccountKeysV2(httpClient, api.GetServiceAccountKeysRequest{ServiceAccountId: serviceAccountDetails.ServiceAccount.ID})
	if err != nil {
		return nil, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to get service account key details. [err=%v]", err)
	}

	// find key for requested project
	var workspaceServiceAccountKey api.ServiceAccountKey
	for _, serviceAccountKey := range serviceAccountKeys.ServiceAccountKeys {
		if serviceAccountKey.Workspace == projectId {
			workspaceServiceAccountKey = serviceAccountKey
		}
	}

	if workspaceServiceAccountKey.ID == "" || workspaceServiceAccountKey.EncryptedKey == "" || workspaceServiceAccountKey.Nonce == "" || serviceAccountCreds.PublicKey == "" || serviceAccountCreds.PrivateKey == "" {
		return nil, fmt.Errorf("unable to find key for [projectId=%s] [err=%v]. Ensure that the given service account has access to given projectId", projectId, err)
	}

	secrets, err := infisicalClient.Secrets().List(infisical.ListSecretsOptions{
		ProjectID:              projectId,
		Environment:            environmentName,
		Recursive:              false,
		SecretPath:             "/",
		IncludeImports:         true,
		ExpandSecretReferences: true,
	})

	if err != nil {
		return nil, err
	}

	var environmentVariables []model.SingleEnvironmentVariable

	for _, secret := range secrets {
		environmentVariables = append(environmentVariables, model.SingleEnvironmentVariable{
			Key:        secret.SecretKey,
			Value:      secret.SecretValue,
			Type:       secret.Type,
			ID:         secret.ID,
			SecretPath: secret.SecretPath,
		})
	}

	return environmentVariables, nil
}
