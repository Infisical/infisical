package util

import (
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/Infisical/infisical/k8-operator/packages/api"
	"github.com/Infisical/infisical/k8-operator/packages/crypto"
	"github.com/Infisical/infisical/k8-operator/packages/model"
	"github.com/go-resty/resty/v2"
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

func GetPlainTextSecretsViaServiceToken(fullServiceToken string, etag string) ([]model.SingleEnvironmentVariable, api.GetEncryptedSecretsV3Response, error) {
	serviceTokenParts := strings.SplitN(fullServiceToken, ".", 4)
	if len(serviceTokenParts) < 4 {
		return nil, api.GetEncryptedSecretsV3Response{}, fmt.Errorf("invalid service token entered. Please double check your service token and try again")
	}

	serviceToken := fmt.Sprintf("%v.%v.%v", serviceTokenParts[0], serviceTokenParts[1], serviceTokenParts[2])

	httpClient := resty.New()

	httpClient.SetAuthToken(serviceToken).
		SetHeader("Accept", "application/json")

	serviceTokenDetails, err := api.CallGetServiceTokenDetailsV2(httpClient)
	if err != nil {
		return nil, api.GetEncryptedSecretsV3Response{}, fmt.Errorf("unable to get service token details. [err=%v]", err)
	}

	encryptedSecretsResponse, err := api.CallGetSecretsV3(httpClient, api.GetEncryptedSecretsV3Request{
		WorkspaceId: serviceTokenDetails.Workspace,
		Environment: serviceTokenDetails.Environment,
		ETag:        etag,
		SecretPath:  serviceTokenDetails.SecretPath,
	})

	if err != nil {
		return nil, api.GetEncryptedSecretsV3Response{}, err
	}

	decodedSymmetricEncryptionDetails, err := GetBase64DecodedSymmetricEncryptionDetails(serviceTokenParts[3], serviceTokenDetails.EncryptedKey, serviceTokenDetails.Iv, serviceTokenDetails.Tag)
	if err != nil {
		return nil, api.GetEncryptedSecretsV3Response{}, fmt.Errorf("unable to decode symmetric encryption details [err=%v]", err)
	}

	plainTextWorkspaceKey, err := crypto.DecryptSymmetric([]byte(serviceTokenParts[3]), decodedSymmetricEncryptionDetails.Cipher, decodedSymmetricEncryptionDetails.Tag, decodedSymmetricEncryptionDetails.IV)
	if err != nil {
		return nil, api.GetEncryptedSecretsV3Response{}, fmt.Errorf("unable to decrypt the required workspace key")
	}

	plainTextSecrets, err := GetPlainTextSecrets(plainTextWorkspaceKey, encryptedSecretsResponse)
	if err != nil {
		return nil, api.GetEncryptedSecretsV3Response{}, fmt.Errorf("unable to decrypt your secrets [err=%v]", err)
	}

	return plainTextSecrets, encryptedSecretsResponse, nil
}

// Fetches plaintext secrets from an API endpoint using a service account.
// The function fetches the service account details and keys, decrypts the workspace key, fetches the encrypted secrets for the specified project and environment, and decrypts the secrets using the decrypted workspace key.
// Returns the plaintext secrets, encrypted secrets response, and any errors that occurred during the process.
func GetPlainTextSecretsViaServiceAccount(serviceAccountCreds model.ServiceAccountDetails, projectId string, environmentName string, etag string) ([]model.SingleEnvironmentVariable, api.GetEncryptedSecretsV3Response, error) {
	httpClient := resty.New()
	httpClient.SetAuthToken(serviceAccountCreds.AccessKey).
		SetHeader("Accept", "application/json")

	serviceAccountDetails, err := api.CallGetServiceTokenAccountDetailsV2(httpClient)
	if err != nil {
		return nil, api.GetEncryptedSecretsV3Response{}, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to get service account details. [err=%v]", err)
	}

	serviceAccountKeys, err := api.CallGetServiceAccountKeysV2(httpClient, api.GetServiceAccountKeysRequest{ServiceAccountId: serviceAccountDetails.ServiceAccount.ID})
	if err != nil {
		return nil, api.GetEncryptedSecretsV3Response{}, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to get service account key details. [err=%v]", err)
	}

	// find key for requested project
	var workspaceServiceAccountKey api.ServiceAccountKey
	for _, serviceAccountKey := range serviceAccountKeys.ServiceAccountKeys {
		if serviceAccountKey.Workspace == projectId {
			workspaceServiceAccountKey = serviceAccountKey
		}
	}

	if workspaceServiceAccountKey.ID == "" || workspaceServiceAccountKey.EncryptedKey == "" || workspaceServiceAccountKey.Nonce == "" || serviceAccountCreds.PublicKey == "" || serviceAccountCreds.PrivateKey == "" {
		return nil, api.GetEncryptedSecretsV3Response{}, fmt.Errorf("unable to find key for [projectId=%s] [err=%v]. Ensure that the given service account has access to given projectId", projectId, err)
	}

	cipherText, err := base64.StdEncoding.DecodeString(workspaceServiceAccountKey.EncryptedKey)
	if err != nil {
		return nil, api.GetEncryptedSecretsV3Response{}, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to decode EncryptedKey secrets because [err=%v]", err)
	}

	nonce, err := base64.StdEncoding.DecodeString(workspaceServiceAccountKey.Nonce)
	if err != nil {
		return nil, api.GetEncryptedSecretsV3Response{}, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to decode nonce secrets because [err=%v]", err)
	}

	publickey, err := base64.StdEncoding.DecodeString(serviceAccountCreds.PublicKey)
	if err != nil {
		return nil, api.GetEncryptedSecretsV3Response{}, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to decode PublicKey secrets because [err=%v]", err)
	}

	privateKey, err := base64.StdEncoding.DecodeString(serviceAccountCreds.PrivateKey)

	if err != nil {
		return nil, api.GetEncryptedSecretsV3Response{}, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to decode PrivateKey secrets because [err=%v]", err)
	}

	plainTextWorkspaceKey := crypto.DecryptAsymmetric(cipherText, nonce, publickey, privateKey)

	encryptedSecretsResponse, err := api.CallGetSecretsV3(httpClient, api.GetEncryptedSecretsV3Request{
		WorkspaceId: projectId,
		Environment: environmentName,
		ETag:        etag,
	})

	if err != nil {
		return nil, api.GetEncryptedSecretsV3Response{}, fmt.Errorf("unable to fetch secrets because [err=%v]", err)
	}

	plainTextSecrets, err := GetPlainTextSecrets(plainTextWorkspaceKey, encryptedSecretsResponse)
	if err != nil {
		return nil, api.GetEncryptedSecretsV3Response{}, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to get plain text secrets because [err=%v]", err)
	}

	return plainTextSecrets, encryptedSecretsResponse, nil
}

func GetBase64DecodedSymmetricEncryptionDetails(key string, cipher string, IV string, tag string) (DecodedSymmetricEncryptionDetails, error) {
	cipherx, err := base64.StdEncoding.DecodeString(cipher)
	if err != nil {
		return DecodedSymmetricEncryptionDetails{}, fmt.Errorf("Base64DecodeSymmetricEncryptionDetails: Unable to decode cipher text [err=%v]", err)
	}

	keyx, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		return DecodedSymmetricEncryptionDetails{}, fmt.Errorf("Base64DecodeSymmetricEncryptionDetails: Unable to decode key [err=%v]", err)
	}

	IVx, err := base64.StdEncoding.DecodeString(IV)
	if err != nil {
		return DecodedSymmetricEncryptionDetails{}, fmt.Errorf("Base64DecodeSymmetricEncryptionDetails: Unable to decode IV [err=%v]", err)
	}

	tagx, err := base64.StdEncoding.DecodeString(tag)
	if err != nil {
		return DecodedSymmetricEncryptionDetails{}, fmt.Errorf("Base64DecodeSymmetricEncryptionDetails: Unable to decode tag [err=%v]", err)
	}

	return DecodedSymmetricEncryptionDetails{
		Key:    keyx,
		Cipher: cipherx,
		IV:     IVx,
		Tag:    tagx,
	}, nil
}

func GetPlainTextSecrets(key []byte, encryptedSecretsResponse api.GetEncryptedSecretsV3Response) ([]model.SingleEnvironmentVariable, error) {
	plainTextSecrets := []model.SingleEnvironmentVariable{}
	for _, secret := range encryptedSecretsResponse.Secrets {
		// Decrypt key
		key_iv, err := base64.StdEncoding.DecodeString(secret.SecretKeyIV)
		if err != nil {
			return nil, fmt.Errorf("unable to decode secret IV for secret key")
		}

		key_tag, err := base64.StdEncoding.DecodeString(secret.SecretKeyTag)
		if err != nil {
			return nil, fmt.Errorf("unable to decode secret authentication tag for secret key")
		}

		key_ciphertext, err := base64.StdEncoding.DecodeString(secret.SecretKeyCiphertext)
		if err != nil {
			return nil, fmt.Errorf("unable to decode secret cipher text for secret key")
		}

		plainTextKey, err := crypto.DecryptSymmetric(key, key_ciphertext, key_tag, key_iv)
		if err != nil {
			return nil, fmt.Errorf("unable to symmetrically decrypt secret key")
		}

		// Decrypt value
		value_iv, err := base64.StdEncoding.DecodeString(secret.SecretValueIV)
		if err != nil {
			return nil, fmt.Errorf("unable to decode secret IV for secret value")
		}

		value_tag, err := base64.StdEncoding.DecodeString(secret.SecretValueTag)
		if err != nil {
			return nil, fmt.Errorf("unable to decode secret authentication tag for secret value")
		}

		value_ciphertext, _ := base64.StdEncoding.DecodeString(secret.SecretValueCiphertext)
		if err != nil {
			return nil, fmt.Errorf("unable to decode secret cipher text for secret key")
		}

		plainTextValue, err := crypto.DecryptSymmetric(key, value_ciphertext, value_tag, value_iv)
		if err != nil {
			return nil, fmt.Errorf("unable to symmetrically decrypt secret value")
		}

		plainTextSecret := model.SingleEnvironmentVariable{
			Key:   string(plainTextKey),
			Value: string(plainTextValue),
			Type:  string(secret.Type),
			ID:    secret.ID,
		}

		plainTextSecrets = append(plainTextSecrets, plainTextSecret)
	}

	return plainTextSecrets, nil
}
