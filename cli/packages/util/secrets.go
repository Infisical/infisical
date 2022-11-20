package util

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/go-resty/resty/v2"
	log "github.com/sirupsen/logrus"
	"golang.org/x/crypto/nacl/box"
)

func GetSecretsFromAPIUsingCurrentLoggedInUser(envName string, userCreds models.UserCredentials) ([]models.SingleEnvironmentVariable, error) {
	log.Debugln("envName", envName, "userCreds", userCreds)
	// check if user has configured a workspace
	workspace, err := GetWorkSpaceFromFile()
	if err != nil {
		return nil, fmt.Errorf("Unable to read workspace file:", err)
	}

	// create http client
	httpClient := resty.New().
		SetAuthToken(userCreds.JTWToken).
		SetHeader("Accept", "application/json")

	var pullSecretsRequestResponse models.PullSecretsResponse
	response, err := httpClient.
		R().
		SetQueryParam("environment", envName).
		SetQueryParam("channel", "cli").
		SetResult(&pullSecretsRequestResponse).
		Get(fmt.Sprintf("%v/v1/secret/%v", INFISICAL_URL, workspace.WorkspaceId)) // need to change workspace id

	log.Debugln("Response from get secrets:", response)

	if err != nil {
		return nil, err
	}

	if response.StatusCode() > 299 {
		log.Debugln(response)
		return nil, fmt.Errorf(response.Status())
	}

	// Get workspace key
	workspaceKey, err := base64.StdEncoding.DecodeString(pullSecretsRequestResponse.Key.EncryptedKey)
	if err != nil {
		return nil, err
	}

	nonce, err := base64.StdEncoding.DecodeString(pullSecretsRequestResponse.Key.Nonce)
	if err != nil {
		return nil, err
	}

	senderPublicKey, err := base64.StdEncoding.DecodeString(pullSecretsRequestResponse.Key.Sender.PublicKey)
	if err != nil {
		return nil, err
	}

	currentUsersPrivateKey, err := base64.StdEncoding.DecodeString(userCreds.PrivateKey)
	if err != nil {
		return nil, err
	}

	log.Debugln("workspaceKey", workspaceKey, "nonce", nonce, "senderPublicKey", senderPublicKey, "currentUsersPrivateKey", currentUsersPrivateKey)
	workspaceKeyInBytes, _ := box.Open(nil, workspaceKey, (*[24]byte)(nonce), (*[32]byte)(senderPublicKey), (*[32]byte)(currentUsersPrivateKey))
	var listOfEnv []models.SingleEnvironmentVariable

	for _, secret := range pullSecretsRequestResponse.Secrets {
		key_iv, _ := base64.StdEncoding.DecodeString(secret.SecretKeyIV)
		key_tag, _ := base64.StdEncoding.DecodeString(secret.SecretKeyTag)
		key_ciphertext, _ := base64.StdEncoding.DecodeString(secret.SecretKeyCiphertext)

		plainTextKey, err := DecryptSymmetric(workspaceKeyInBytes, key_ciphertext, key_tag, key_iv)
		if err != nil {
			return nil, err
		}

		value_iv, _ := base64.StdEncoding.DecodeString(secret.SecretValueIV)
		value_tag, _ := base64.StdEncoding.DecodeString(secret.SecretValueTag)
		value_ciphertext, _ := base64.StdEncoding.DecodeString(secret.SecretValueCiphertext)

		plainTextValue, err := DecryptSymmetric(workspaceKeyInBytes, value_ciphertext, value_tag, value_iv)
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
		log.Debugln(response)
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

		plainTextKey, err := DecryptSymmetric(workspaceKeyInBytes, key_ciphertext, key_tag, key_iv)
		if err != nil {
			return nil, err
		}

		value_iv, _ := base64.StdEncoding.DecodeString(secret.SecretValue.Iv)
		value_tag, _ := base64.StdEncoding.DecodeString(secret.SecretValue.Tag)
		value_ciphertext, _ := base64.StdEncoding.DecodeString(secret.SecretValue.Ciphertext)

		plainTextValue, err := DecryptSymmetric(workspaceKeyInBytes, value_ciphertext, value_tag, value_iv)
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

func GetWorkSpacesFromAPI(userCreds models.UserCredentials) (workspaces []models.Workspace, err error) {
	// create http client
	httpClient := resty.New().
		SetAuthToken(userCreds.JTWToken).
		SetHeader("Accept", "application/json")

	var getWorkSpacesResponse models.GetWorkSpacesResponse
	response, err := httpClient.
		R().
		SetResult(&getWorkSpacesResponse).
		Get(fmt.Sprintf("%v/v1/workspace", INFISICAL_URL))

	if err != nil {
		return nil, err
	}

	if response.StatusCode() > 299 {
		return nil, fmt.Errorf("ops, unsuccessful response code. [response=%v]", response)
	}

	return getWorkSpacesResponse.Workspaces, nil
}
