package api

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"github.com/Infisical/infisical/k8-operator/packages/crypto"
	"github.com/Infisical/infisical/k8-operator/packages/models"
	"github.com/go-resty/resty/v2"
	"golang.org/x/crypto/nacl/box"
)

const INFISICAL_URL = "https://app.infisical.com/api"

func GetAllEnvironmentVariables(projectId string, envName string, infisicalToken string) ([]models.SingleEnvironmentVariable, error) {
	envsFromApi, err := GetSecretsFromAPIUsingInfisicalToken(infisicalToken, envName, projectId)
	if err != nil {
		return nil, err
	}

	return envsFromApi, nil
}

func GetSecretsFromAPIUsingInfisicalToken(infisicalToken string, envName string, projectId string) ([]models.SingleEnvironmentVariable, error) {
	if infisicalToken == "" || projectId == "" || envName == "" {
		return nil, errors.New("infisical token, project id and or environment name cannot be empty")
	}

	splitToken := strings.Split(infisicalToken, ",")
	JTWToken := splitToken[0]
	temPrivateKey := splitToken[1]

	// create http client
	httpClient := resty.New().
		SetAuthToken(JTWToken).
		SetHeader("Accept", "application/json")

	var pullSecretsByInfisicalTokenResponse models.PullSecretsByInfisicalTokenResponse
	response, err := httpClient.
		R().
		SetQueryParam("environment", envName).
		SetQueryParam("channel", "cli").
		SetResult(&pullSecretsByInfisicalTokenResponse).
		Get(fmt.Sprintf("%v/v1/secret/%v/service-token", INFISICAL_URL, projectId))

	if err != nil {
		return nil, err
	}

	if response.StatusCode() > 299 {
		return nil, fmt.Errorf(response.Status())
	}

	// Get workspace key
	workspaceKey, err := base64.StdEncoding.DecodeString(pullSecretsByInfisicalTokenResponse.Key.EncryptedKey)
	if err != nil {
		return nil, err
	}

	nonce, err := base64.StdEncoding.DecodeString(pullSecretsByInfisicalTokenResponse.Key.Nonce)
	if err != nil {
		return nil, err
	}

	senderPublicKey, err := base64.StdEncoding.DecodeString(pullSecretsByInfisicalTokenResponse.Key.Sender.PublicKey)
	if err != nil {
		return nil, err
	}

	currentUsersPrivateKey, err := base64.StdEncoding.DecodeString(temPrivateKey)
	if err != nil {
		return nil, err
	}

	workspaceKeyInBytes, _ := box.Open(nil, workspaceKey, (*[24]byte)(nonce), (*[32]byte)(senderPublicKey), (*[32]byte)(currentUsersPrivateKey))
	var listOfEnv []models.SingleEnvironmentVariable

	for _, secret := range pullSecretsByInfisicalTokenResponse.Secrets {
		key_iv, _ := base64.StdEncoding.DecodeString(secret.SecretKey.Iv)
		key_tag, _ := base64.StdEncoding.DecodeString(secret.SecretKey.Tag)
		key_ciphertext, _ := base64.StdEncoding.DecodeString(secret.SecretKey.Ciphertext)

		plainTextKey, err := crypto.DecryptSymmetric(workspaceKeyInBytes, key_ciphertext, key_tag, key_iv)
		if err != nil {
			return nil, err
		}

		value_iv, _ := base64.StdEncoding.DecodeString(secret.SecretValue.Iv)
		value_tag, _ := base64.StdEncoding.DecodeString(secret.SecretValue.Tag)
		value_ciphertext, _ := base64.StdEncoding.DecodeString(secret.SecretValue.Ciphertext)

		plainTextValue, err := crypto.DecryptSymmetric(workspaceKeyInBytes, value_ciphertext, value_tag, value_iv)
		if err != nil {
			return nil, err
		}

		env := models.SingleEnvironmentVariable{
			Key:   string(plainTextKey),
			Value: string(plainTextValue),
		}

		listOfEnv = append(listOfEnv, env)
	}

	return listOfEnv, nil
}
