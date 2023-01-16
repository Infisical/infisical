package util

import (
	"encoding/base64"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/crypto"
	"github.com/Infisical/infisical-merge/packages/models"
	log "github.com/sirupsen/logrus"

	"github.com/go-resty/resty/v2"
)

func GetPlainTextSecretsViaServiceToken(fullServiceToken string) ([]models.SingleEnvironmentVariable, error) {
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

	encryptedSecrets, err := api.CallGetSecretsV2(httpClient, api.GetEncryptedSecretsV2Request{
		WorkspaceId: serviceTokenDetails.Workspace,
		Environment: serviceTokenDetails.Environment,
	})

	if err != nil {
		return nil, err
	}

	decodedSymmetricEncryptionDetails, err := GetBase64DecodedSymmetricEncryptionDetails(serviceTokenParts[3], serviceTokenDetails.EncryptedKey, serviceTokenDetails.Iv, serviceTokenDetails.Tag)
	if err != nil {
		return nil, fmt.Errorf("unable to decode symmetric encryption details [err=%v]", err)
	}

	plainTextWorkspaceKey, err := crypto.DecryptSymmetric([]byte(serviceTokenParts[3]), decodedSymmetricEncryptionDetails.Cipher, decodedSymmetricEncryptionDetails.Tag, decodedSymmetricEncryptionDetails.IV)
	if err != nil {
		return nil, fmt.Errorf("unable to decrypt the required workspace key")
	}

	plainTextSecrets, err := GetPlainTextSecrets(plainTextWorkspaceKey, encryptedSecrets)
	if err != nil {
		return nil, fmt.Errorf("unable to decrypt your secrets [err=%v]", err)
	}

	return plainTextSecrets, nil
}

func GetPlainTextSecretsViaJTW(JTWToken string, receiversPrivateKey string, workspaceId string, environmentName string) ([]models.SingleEnvironmentVariable, error) {
	httpClient := resty.New()
	httpClient.SetAuthToken(JTWToken).
		SetHeader("Accept", "application/json")

	request := api.GetEncryptedWorkspaceKeyRequest{
		WorkspaceId: workspaceId,
	}

	workspaceKeyResponse, err := api.CallGetEncryptedWorkspaceKey(httpClient, request)
	if err != nil {
		return nil, fmt.Errorf("unable to get your encrypted workspace key. [err=%v]", err)
	}

	encryptedWorkspaceKey, _ := base64.StdEncoding.DecodeString(workspaceKeyResponse.EncryptedKey)
	encryptedWorkspaceKeySenderPublicKey, _ := base64.StdEncoding.DecodeString(workspaceKeyResponse.Sender.PublicKey)
	encryptedWorkspaceKeyNonce, _ := base64.StdEncoding.DecodeString(workspaceKeyResponse.Nonce)
	currentUsersPrivateKey, _ := base64.StdEncoding.DecodeString(receiversPrivateKey)
	plainTextWorkspaceKey := crypto.DecryptAsymmetric(encryptedWorkspaceKey, encryptedWorkspaceKeyNonce, encryptedWorkspaceKeySenderPublicKey, currentUsersPrivateKey)

	encryptedSecrets, err := api.CallGetSecretsV2(httpClient, api.GetEncryptedSecretsV2Request{
		WorkspaceId: workspaceId,
		Environment: environmentName,
	})

	if err != nil {
		return nil, err
	}

	plainTextSecrets, err := GetPlainTextSecrets(plainTextWorkspaceKey, encryptedSecrets)
	if err != nil {
		return nil, fmt.Errorf("unable to decrypt your secrets [err=%v]", err)
	}

	return plainTextSecrets, nil
}

func GetAllEnvironmentVariables(envName string) ([]models.SingleEnvironmentVariable, error) {
	infisicalToken := os.Getenv(INFISICAL_TOKEN_NAME)

	if infisicalToken == "" {
		RequireLocalWorkspaceFile()
		RequireLogin()
		log.Debug("Trying to fetch secrets using logged in details")

		loggedInUserDetails, err := GetCurrentLoggedInUserDetails()
		if err != nil {
			return nil, err
		}

		workspaceFile, err := GetWorkSpaceFromFile()
		if err != nil {
			return nil, err
		}

		secrets, err := GetPlainTextSecretsViaJTW(loggedInUserDetails.UserCredentials.JTWToken, loggedInUserDetails.UserCredentials.PrivateKey, workspaceFile.WorkspaceId, envName)
		return secrets, err

	} else {
		log.Debug("Trying to fetch secrets using service token")
		return GetPlainTextSecretsViaServiceToken(infisicalToken)
	}
}

func getExpandedEnvVariable(secrets []models.SingleEnvironmentVariable, variableWeAreLookingFor string, hashMapOfCompleteVariables map[string]string, hashMapOfSelfRefs map[string]string) string {
	if value, found := hashMapOfCompleteVariables[variableWeAreLookingFor]; found {
		return value
	}

	for _, secret := range secrets {
		if secret.Key == variableWeAreLookingFor {
			regex := regexp.MustCompile(`\${([^\}]*)}`)
			variablesToPopulate := regex.FindAllString(secret.Value, -1)

			// case: variable is a constant so return its value
			if len(variablesToPopulate) == 0 {
				return secret.Value
			}

			valueToEdit := secret.Value
			for _, variableWithSign := range variablesToPopulate {
				variableWithoutSign := strings.Trim(variableWithSign, "}")
				variableWithoutSign = strings.Trim(variableWithoutSign, "${")

				// case: reference to self
				if variableWithoutSign == secret.Key {
					hashMapOfSelfRefs[variableWithoutSign] = variableWithoutSign
					continue
				} else {
					var expandedVariableValue string

					if preComputedVariable, found := hashMapOfCompleteVariables[variableWithoutSign]; found {
						expandedVariableValue = preComputedVariable
					} else {
						expandedVariableValue = getExpandedEnvVariable(secrets, variableWithoutSign, hashMapOfCompleteVariables, hashMapOfSelfRefs)
						hashMapOfCompleteVariables[variableWithoutSign] = expandedVariableValue
					}

					// If after expanding all the vars above, is the current var a self ref? if so no replacement needed for it
					if _, found := hashMapOfSelfRefs[variableWithoutSign]; found {
						continue
					} else {
						valueToEdit = strings.ReplaceAll(valueToEdit, variableWithSign, expandedVariableValue)
					}
				}
			}

			return valueToEdit

		} else {
			continue
		}
	}

	return "${" + variableWeAreLookingFor + "}"
}

func SubstituteSecrets(secrets []models.SingleEnvironmentVariable) []models.SingleEnvironmentVariable {
	hashMapOfCompleteVariables := make(map[string]string)
	hashMapOfSelfRefs := make(map[string]string)
	expandedSecrets := []models.SingleEnvironmentVariable{}

	for _, secret := range secrets {
		expandedVariable := getExpandedEnvVariable(secrets, secret.Key, hashMapOfCompleteVariables, hashMapOfSelfRefs)
		expandedSecrets = append(expandedSecrets, models.SingleEnvironmentVariable{
			Key:   secret.Key,
			Value: expandedVariable,
			Type:  secret.Type,
		})

	}

	return expandedSecrets
}

//

// if two secrets with the same name are found, the one that has type `personal` will be in the returned list
func OverrideWithPersonalSecrets(secrets []models.SingleEnvironmentVariable) []models.SingleEnvironmentVariable {
	personalSecret := make(map[string]models.SingleEnvironmentVariable)
	sharedSecret := make(map[string]models.SingleEnvironmentVariable)
	secretsToReturn := []models.SingleEnvironmentVariable{}

	for _, secret := range secrets {
		if secret.Type == PERSONAL_SECRET_TYPE_NAME {
			personalSecret[secret.Key] = secret
		}

		if secret.Type == SHARED_SECRET_TYPE_NAME {
			sharedSecret[secret.Key] = secret
		}
	}

	for _, secret := range sharedSecret {
		personalValue, personalExists := personalSecret[secret.Key]
		if personalExists {
			secretsToReturn = append(secretsToReturn, personalValue)
		} else {
			secretsToReturn = append(secretsToReturn, secret)
		}
	}

	return secretsToReturn
}

func GetPlainTextSecrets(key []byte, encryptedSecrets api.GetEncryptedSecretsV2Response) ([]models.SingleEnvironmentVariable, error) {
	plainTextSecrets := []models.SingleEnvironmentVariable{}
	for _, secret := range encryptedSecrets.Secrets {
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

		plainTextSecret := models.SingleEnvironmentVariable{
			Key:   string(plainTextKey),
			Value: string(plainTextValue),
			Type:  string(secret.Type),
			ID:    secret.ID,
		}

		plainTextSecrets = append(plainTextSecrets, plainTextSecret)
	}

	return plainTextSecrets, nil
}
