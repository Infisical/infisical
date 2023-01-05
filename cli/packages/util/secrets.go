package util

import (
	"encoding/base64"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/crypto"
	"github.com/Infisical/infisical-merge/packages/http"
	"github.com/Infisical/infisical-merge/packages/models"

	"github.com/go-resty/resty/v2"
	log "github.com/sirupsen/logrus"
)

const PERSONAL_SECRET_TYPE_NAME = "personal"
const SHARED_SECRET_TYPE_NAME = "shared"

func getSecretsByWorkspaceIdAndEnvName(httpClient resty.Client, envName string, workspace models.WorkspaceConfigFile, userCreds models.UserCredentials) (listOfSecrets []models.SingleEnvironmentVariable, err error) {
	var pullSecretsRequestResponse models.PullSecretsResponse
	response, err := httpClient.
		R().
		SetQueryParam("environment", envName).
		SetQueryParam("channel", "cli").
		SetResult(&pullSecretsRequestResponse).
		Get(fmt.Sprintf("%v/v1/secret/%v", config.INFISICAL_URL, workspace.WorkspaceId)) // need to change workspace id

	if err != nil {
		return nil, err
	}

	if response.StatusCode() > 299 {
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

	// log.Debugln("workspaceKey", workspaceKey, "nonce", nonce, "senderPublicKey", senderPublicKey, "currentUsersPrivateKey", currentUsersPrivateKey)
	workspaceKeyInBytes := crypto.DecryptAsymmetric(workspaceKey, nonce, senderPublicKey, currentUsersPrivateKey)
	var listOfEnv []models.SingleEnvironmentVariable

	for _, secret := range pullSecretsRequestResponse.Secrets {
		key_iv, _ := base64.StdEncoding.DecodeString(secret.SecretKeyIV)
		key_tag, _ := base64.StdEncoding.DecodeString(secret.SecretKeyTag)
		key_ciphertext, _ := base64.StdEncoding.DecodeString(secret.SecretKeyCiphertext)

		plainTextKey, err := crypto.DecryptSymmetric(workspaceKeyInBytes, key_ciphertext, key_tag, key_iv)
		if err != nil {
			return nil, err
		}

		value_iv, _ := base64.StdEncoding.DecodeString(secret.SecretValueIV)
		value_tag, _ := base64.StdEncoding.DecodeString(secret.SecretValueTag)
		value_ciphertext, _ := base64.StdEncoding.DecodeString(secret.SecretValueCiphertext)

		plainTextValue, err := crypto.DecryptSymmetric(workspaceKeyInBytes, value_ciphertext, value_tag, value_iv)
		if err != nil {
			return nil, err
		}

		env := models.SingleEnvironmentVariable{
			Key:   string(plainTextKey),
			Value: string(plainTextValue),
			Type:  string(secret.Type),
			ID:    secret.ID,
		}

		listOfEnv = append(listOfEnv, env)
	}

	return listOfEnv, nil
}

func GetSecretsFromAPIUsingCurrentLoggedInUser(envName string, userCreds models.UserCredentials) ([]models.SingleEnvironmentVariable, error) {
	log.Debugln("GetSecretsFromAPIUsingCurrentLoggedInUser", "envName", envName, "userCreds", userCreds)
	// check if user has configured a workspace
	workspaces, err := GetAllWorkSpaceConfigsStartingFromCurrentPath()
	if err != nil {
		return nil, fmt.Errorf("Unable to read workspace file(s):", err)
	}

	// create http client
	httpClient := resty.New().
		SetAuthToken(userCreds.JTWToken).
		SetHeader("Accept", "application/json")

	secrets := []models.SingleEnvironmentVariable{}
	for _, workspace := range workspaces {
		secretsFromAPI, err := getSecretsByWorkspaceIdAndEnvName(*httpClient, envName, workspace, userCreds)
		if err != nil {
			return nil, fmt.Errorf("GetSecretsFromAPIUsingCurrentLoggedInUser: Unable to get secrets by workspace id and env name")
		}

		secrets = append(secrets, secretsFromAPI...)
	}

	return secrets, nil
}

// func GetPlainTextSecretsViaJWT(JTWToken string, privateKey string, workspaceId string, environment string) ([]models.SingleEnvironmentVariable, error) {

// 		// get key first

// 		// Get workspace key
// 		workspaceKey, err := base64.StdEncoding.DecodeString(pullSecretsRequestResponse.Key.EncryptedKey)
// 		if err != nil {
// 			return nil, err
// 		}

// 		nonce, err := base64.StdEncoding.DecodeString(pullSecretsRequestResponse.Key.Nonce)
// 		if err != nil {
// 			return nil, err
// 		}

// 		senderPublicKey, err := base64.StdEncoding.DecodeString(pullSecretsRequestResponse.Key.Sender.PublicKey)
// 		if err != nil {
// 			return nil, err
// 		}

// 		currentUsersPrivateKey, err := base64.StdEncoding.DecodeString(userCreds.PrivateKey)
// 		if err != nil {
// 			return nil, err
// 		}

// 		// log.Debugln("workspaceKey", workspaceKey, "nonce", nonce, "senderPublicKey", senderPublicKey, "currentUsersPrivateKey", currentUsersPrivateKey)
// 		workspaceKeyInBytes := crypto.DecryptAsymmetric(workspaceKey, nonce, senderPublicKey, currentUsersPrivateKey)

// 	httpClient := resty.New()
// 	httpClient.SetAuthToken(JTWToken).
// 		SetHeader("Accept", "application/json")

// 	serviceTokenDetails, err := http.CallGetServiceTokenDetailsV2(httpClient)
// 	if err != nil {
// 		return nil, fmt.Errorf("unable to get service token details. [err=%v]", err)
// 	}

// 	encryptedSecrets, err := http.CallGetSecretsV2(httpClient, models.GetEncryptedSecretsV2Request{
// 		WorkspaceId:     workspaceId,
// 		EnvironmentName: environment,
// 	})

// 	if err != nil {
// 		return nil, err
// 	}

// 	// workspace key

// 	decodedSymmetricEncryptionDetails, err := GetBase64DecodedSymmetricEncryptionDetails(serviceTokenParts[3], serviceTokenDetails.EncryptedKey, serviceTokenDetails.Iv, serviceTokenDetails.Tag)
// 	if err != nil {
// 		return nil, fmt.Errorf("unable to decode symmetric encryption details [err=%v]", err)
// 	}

// 	plainTextWorkspaceKey, err := crypto.DecryptSymmetric(decodedSymmetricEncryptionDetails.Key, decodedSymmetricEncryptionDetails.Cipher, decodedSymmetricEncryptionDetails.Tag, decodedSymmetricEncryptionDetails.IV)
// 	if err != nil {
// 		return nil, fmt.Errorf("unable to decrypt the required workspace key")
// 	}

// 	plainTextSecrets, err := GetPlainTextSecrets(plainTextWorkspaceKey, encryptedSecrets)
// 	if err != nil {
// 		return nil, fmt.Errorf("unable to decrypt your secrets [err=%v]", err)
// 	}

// 	return plainTextSecrets, nil
// }

func GetPlainTextSecretsViaServiceToken(fullServiceToken string) ([]models.SingleEnvironmentVariable, error) {
	// encryotion key, http,

	serviceTokenParts := strings.SplitN(fullServiceToken, ".", 4)
	if len(serviceTokenParts) < 4 {
		return nil, fmt.Errorf("invalid service token entered. Please double check your service token and try again")
	}

	serviceToken := fmt.Sprintf("%v.%v.%v", serviceTokenParts[0], serviceTokenParts[1], serviceTokenParts[2])

	httpClient := resty.New()
	httpClient.SetAuthToken(serviceToken).
		SetHeader("Accept", "application/json")

	serviceTokenDetails, err := http.CallGetServiceTokenDetailsV2(httpClient)
	if err != nil {
		return nil, fmt.Errorf("unable to get service token details. [err=%v]", err)
	}

	encryptedSecrets, err := http.CallGetSecretsV2(httpClient, models.GetEncryptedSecretsV2Request{
		WorkspaceId:     serviceTokenDetails.Workspace,
		EnvironmentName: serviceTokenDetails.Environment,
	})

	if err != nil {
		return nil, err
	}

	decodedSymmetricEncryptionDetails, err := GetBase64DecodedSymmetricEncryptionDetails(serviceTokenParts[3], serviceTokenDetails.EncryptedKey, serviceTokenDetails.Iv, serviceTokenDetails.Tag)
	if err != nil {
		return nil, fmt.Errorf("unable to decode symmetric encryption details [err=%v]", err)
	}

	plainTextWorkspaceKey, err := crypto.DecryptSymmetric(decodedSymmetricEncryptionDetails.Key, decodedSymmetricEncryptionDetails.Cipher, decodedSymmetricEncryptionDetails.Tag, decodedSymmetricEncryptionDetails.IV)
	if err != nil {
		return nil, fmt.Errorf("unable to decrypt the required workspace key")
	}

	plainTextSecrets, err := GetPlainTextSecrets(plainTextWorkspaceKey, encryptedSecrets)
	if err != nil {
		return nil, fmt.Errorf("unable to decrypt your secrets [err=%v]", err)
	}

	return plainTextSecrets, nil
}

func GetAllEnvironmentVariables(projectId string, envName string) ([]models.SingleEnvironmentVariable, error) {
	infisicalToken := os.Getenv(INFISICAL_TOKEN_NAME)

	if infisicalToken == "" {
		hasUserLoggedInbefore, loggedInUserEmail, err := IsUserLoggedIn()
		if err != nil {
			log.Info("Unexpected issue occurred while checking login status. To see more details, add flag --debug")
			log.Debugln(err)
			return nil, err
		}

		if !hasUserLoggedInbefore {
			log.Infoln("No logged in user. To login, please run command [infisical login]")
			return nil, fmt.Errorf("user not logged in")
		}

		userCreds, err := GetUserCredsFromKeyRing(loggedInUserEmail)
		if err != nil {
			log.Infoln("Unable to get user creds from key ring")
			log.Debug(err)
			return nil, err
		}

		// TODO: Should be based on flag. I.e only get all workspaces if desired, otherwise only get the one in the current root of project
		workspaceConfigs, err := GetAllWorkSpaceConfigsStartingFromCurrentPath()
		if err != nil {
			return nil, fmt.Errorf("unable to check if you have a %s file in your current directory", INFISICAL_WORKSPACE_CONFIG_FILE_NAME)
		}

		if len(workspaceConfigs) == 0 {
			log.Infoln("Your local project is not connected to a Infisical project yet. Run command [infisical init]")
			return nil, fmt.Errorf("project not initialized")
		}

		envsFromApi, err := GetSecretsFromAPIUsingCurrentLoggedInUser(envName, userCreds)
		if err != nil {
			log.Errorln("Something went wrong when pulling secrets using your logged in credentials. If the issue persists, double check your project id/try logging in again.")
			log.Debugln(err)
			return nil, err
		}

		return envsFromApi, nil

	} else {
		return GetPlainTextSecretsViaServiceToken(infisicalToken)
	}
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
		Get(fmt.Sprintf("%v/v1/workspace", config.INFISICAL_URL))

	if err != nil {
		return nil, err
	}

	if response.StatusCode() > 299 {
		return nil, fmt.Errorf("ops, unsuccessful response code. [response=%v]", response)
	}

	return getWorkSpacesResponse.Workspaces, nil
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

// if two secrets with the same name are found, the one that has type `personal` will be in the returned list
func OverrideWithPersonalSecrets(secrets []models.SingleEnvironmentVariable) []models.SingleEnvironmentVariable {
	personalSecret := make(map[string]models.SingleEnvironmentVariable)
	sharedSecret := make(map[string]models.SingleEnvironmentVariable)
	secretsToReturn := []models.SingleEnvironmentVariable{}

	for _, secret := range secrets {
		if secret.Type == PERSONAL_SECRET_TYPE_NAME {
			personalSecret[secret.Key] = models.SingleEnvironmentVariable{
				Key:   secret.Key,
				Value: secret.Value,
				Type:  secret.Type,
			}
		}

		if secret.Type == SHARED_SECRET_TYPE_NAME {
			sharedSecret[secret.Key] = models.SingleEnvironmentVariable{
				Key:   secret.Key,
				Value: secret.Value,
				Type:  secret.Type,
			}
		}
	}

	for _, secret := range secrets {
		personalValue, personalExists := personalSecret[secret.Key]
		sharedValue, sharedExists := sharedSecret[secret.Key]

		if personalExists && sharedExists || personalExists && !sharedExists {
			secretsToReturn = append(secretsToReturn, personalValue)
		} else {
			secretsToReturn = append(secretsToReturn, sharedValue)
		}
	}

	return secretsToReturn
}

func GetPlainTextSecrets(key []byte, encryptedSecrets models.GetEncryptedSecretsV2Response) ([]models.SingleEnvironmentVariable, error) {
	plainTextSecrets := []models.SingleEnvironmentVariable{}
	for _, secret := range encryptedSecrets {
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

// func GetWorkspaceKeyViaEnvelopeEncryption(JTWToken string, workspaceId string, privateKey string) {
// 	httpClient := resty.New().
// 		SetAuthToken(JTWToken).
// 		SetHeader("Accept", "application/json")

// 	request := models.GetEncryptedWorkspaceKeyRequest{
// 		WorkspaceId: workspaceId,
// 	}

// 	workspaceKeyResponse, err := http.CallGetEncryptedWorkspaceKey(httpClient, request)
// 	if err != nil {
// 		log.Errorf("unable to get your encrypted workspace key. [err=%v]", err)
// 		return
// 	}

// 	encryptedWorkspaceKey, _ := base64.StdEncoding.DecodeString(workspaceKeyResponse.EncryptedKey)
// 	encryptedWorkspaceKeySenderPublicKey, _ := base64.StdEncoding.DecodeString(workspaceKeyResponse.Sender.PublicKey)
// 	encryptedWorkspaceKeyNonce, _ := base64.StdEncoding.DecodeString(workspaceKeyResponse.Nonce)
// 	currentUsersPrivateKey, _ := base64.StdEncoding.DecodeString(loggedInUserDetails.UserCredentials.PrivateKey)

// 	// decrypt workspace key
// 	plainTextEncryptionKey := crypto.DecryptAsymmetric(encryptedWorkspaceKey, encryptedWorkspaceKeyNonce, encryptedWorkspaceKeySenderPublicKey, currentUsersPrivateKey)

// }
