package util

import (
	"encoding/base64"
	"encoding/json"
	"errors"
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

func GetPlainTextSecretsViaServiceToken(fullServiceToken string) ([]models.SingleEnvironmentVariable, []api.Folders, error) {
	serviceTokenParts := strings.SplitN(fullServiceToken, ".", 4)
	if len(serviceTokenParts) < 4 {
		return nil, nil, fmt.Errorf("invalid service token entered. Please double check your service token and try again")
	}

	serviceToken := fmt.Sprintf("%v.%v.%v", serviceTokenParts[0], serviceTokenParts[1], serviceTokenParts[2])

	httpClient := resty.New()

	httpClient.SetAuthToken(serviceToken).
		SetHeader("Accept", "application/json")

	serviceTokenDetails, err := api.CallGetServiceTokenDetailsV2(httpClient)
	if err != nil {
		return nil, nil, fmt.Errorf("unable to get service token details. [err=%v]", err)
	}

	encryptedSecrets, err := api.CallGetSecretsV2(httpClient, api.GetEncryptedSecretsV2Request{
		WorkspaceId: serviceTokenDetails.Workspace,
		Environment: serviceTokenDetails.Environment,
	})

	if err != nil {
		return nil, nil, err
	}

	decodedSymmetricEncryptionDetails, err := GetBase64DecodedSymmetricEncryptionDetails(serviceTokenParts[3], serviceTokenDetails.EncryptedKey, serviceTokenDetails.Iv, serviceTokenDetails.Tag)
	if err != nil {
		return nil, nil, fmt.Errorf("unable to decode symmetric encryption details [err=%v]", err)
	}

	plainTextWorkspaceKey, err := crypto.DecryptSymmetric([]byte(serviceTokenParts[3]), decodedSymmetricEncryptionDetails.Cipher, decodedSymmetricEncryptionDetails.Tag, decodedSymmetricEncryptionDetails.IV)
	if err != nil {
		return nil, nil, fmt.Errorf("unable to decrypt the required workspace key")
	}

	plainTextSecrets, err := GetPlainTextSecrets(plainTextWorkspaceKey, encryptedSecrets)
	if err != nil {
		return nil, nil, fmt.Errorf("unable to decrypt your secrets [err=%v]", err)
	}

	return plainTextSecrets, encryptedSecrets.Folders, nil
}

func GetPlainTextSecretsViaJTW(JTWToken string, receiversPrivateKey string, workspaceId string, environmentName string, tagSlugs string, secretPath string) ([]models.SingleEnvironmentVariable, []api.Folders, error) {
	httpClient := resty.New()
	httpClient.SetAuthToken(JTWToken).
		SetHeader("Accept", "application/json")

	request := api.GetEncryptedWorkspaceKeyRequest{
		WorkspaceId: workspaceId,
	}

	workspaceKeyResponse, err := api.CallGetEncryptedWorkspaceKey(httpClient, request)
	if err != nil {
		return nil, nil, fmt.Errorf("unable to get your encrypted workspace key. [err=%v]", err)
	}

	encryptedWorkspaceKey, err := base64.StdEncoding.DecodeString(workspaceKeyResponse.EncryptedKey)
	if err != nil {
		HandleError(err, "Unable to get bytes represented by the base64 for encryptedWorkspaceKey")
	}

	encryptedWorkspaceKeySenderPublicKey, err := base64.StdEncoding.DecodeString(workspaceKeyResponse.Sender.PublicKey)
	if err != nil {
		HandleError(err, "Unable to get bytes represented by the base64 for encryptedWorkspaceKeySenderPublicKey")
	}

	encryptedWorkspaceKeyNonce, err := base64.StdEncoding.DecodeString(workspaceKeyResponse.Nonce)
	if err != nil {
		HandleError(err, "Unable to get bytes represented by the base64 for encryptedWorkspaceKeyNonce")
	}

	currentUsersPrivateKey, err := base64.StdEncoding.DecodeString(receiversPrivateKey)
	if err != nil {
		HandleError(err, "Unable to get bytes represented by the base64 for currentUsersPrivateKey")
	}

	if len(currentUsersPrivateKey) == 0 || len(encryptedWorkspaceKeySenderPublicKey) == 0 {
		log.Debugf("Missing credentials for generating plainTextEncryptionKey: [currentUsersPrivateKey=%s] [encryptedWorkspaceKeySenderPublicKey=%s]", currentUsersPrivateKey, encryptedWorkspaceKeySenderPublicKey)
		PrintErrorMessageAndExit("Some required user credentials are missing to generate your [plainTextEncryptionKey]. Please run [infisical login] then try again")
	}

	plainTextWorkspaceKey := crypto.DecryptAsymmetric(encryptedWorkspaceKey, encryptedWorkspaceKeyNonce, encryptedWorkspaceKeySenderPublicKey, currentUsersPrivateKey)

	encryptedSecretsAndFolders, err := api.CallGetSecretsV2(httpClient, api.GetEncryptedSecretsV2Request{
		WorkspaceId: workspaceId,
		Environment: environmentName,
		TagSlugs:    tagSlugs,
		SecretPath:  secretPath,
	})

	if err != nil {
		return nil, nil, err
	}

	plainTextSecrets, err := GetPlainTextSecrets(plainTextWorkspaceKey, encryptedSecretsAndFolders)
	if err != nil {
		return nil, nil, fmt.Errorf("unable to decrypt your secrets [err=%v]", err)
	}

	return plainTextSecrets, encryptedSecretsAndFolders.Folders, nil
}

func GetAllEnvironmentVariables(params models.GetAllSecretsParameters) ([]models.SingleEnvironmentVariable, []api.Folders, error) {
	var infisicalToken string
	if params.InfisicalToken == "" {
		infisicalToken = os.Getenv(INFISICAL_TOKEN_NAME)
	} else {
		infisicalToken = params.InfisicalToken
	}

	isConnected := CheckIsConnectedToInternet()
	var secretsToReturn []models.SingleEnvironmentVariable
	var errorToReturn error
	var folders []api.Folders

	if infisicalToken == "" {
		if isConnected {
			log.Debug("GetAllEnvironmentVariables: Connected to internet, checking logged in creds")
			RequireLocalWorkspaceFile()
			RequireLogin()
		}

		log.Debug("GetAllEnvironmentVariables: Trying to fetch secrets using logged in details")

		loggedInUserDetails, err := GetCurrentLoggedInUserDetails()
		if err != nil {
			return nil, nil, err
		}

		workspaceFile, err := GetWorkSpaceFromFile()
		if err != nil {
			return nil, nil, err
		}

		if params.WorkspaceId != "" {
			workspaceFile.WorkspaceId = params.WorkspaceId
		}

		// Verify environment
		err = ValidateEnvironmentName(params.Environment, workspaceFile.WorkspaceId, loggedInUserDetails.UserCredentials)
		if err != nil {
			return nil, nil, fmt.Errorf("unable to validate environment name because [err=%s]", err)
		}

		secretsToReturn, folders, errorToReturn = GetPlainTextSecretsViaJTW(loggedInUserDetails.UserCredentials.JTWToken, loggedInUserDetails.UserCredentials.PrivateKey, workspaceFile.WorkspaceId, params.Environment, params.TagSlugs, params.Path)
		log.Debugf("GetAllEnvironmentVariables: Trying to fetch secrets JTW token [err=%s]", errorToReturn)

		backupSecretsEncryptionKey := []byte(loggedInUserDetails.UserCredentials.PrivateKey)[0:32]
		if errorToReturn == nil {
			WriteBackupSecrets(workspaceFile.WorkspaceId, params.Environment, backupSecretsEncryptionKey, secretsToReturn)
		}

		// only attempt to serve cached secrets if no internet connection and if at least one secret cached
		if !isConnected {
			backedSecrets, err := ReadBackupSecrets(workspaceFile.WorkspaceId, params.Environment, backupSecretsEncryptionKey)
			if len(backedSecrets) > 0 {
				PrintWarning("Unable to fetch latest secret(s) due to connection error, serving secrets from last successful fetch. For more info, run with --debug")
				secretsToReturn = backedSecrets
				errorToReturn = err
			}
		}

	} else {
		log.Debug("Trying to fetch secrets using service token")
		secretsToReturn, folders, errorToReturn = GetPlainTextSecretsViaServiceToken(infisicalToken)
	}

	return secretsToReturn, folders, errorToReturn
}

func ValidateEnvironmentName(environmentName string, workspaceId string, userLoggedInDetails models.UserCredentials) error {
	httpClient := resty.New()
	httpClient.SetAuthToken(userLoggedInDetails.JTWToken).
		SetHeader("Accept", "application/json")

	response, err := api.CallGetAccessibleEnvironments(httpClient, api.GetAccessibleEnvironmentsRequest{WorkspaceId: workspaceId})
	if err != nil {
		return err
	}

	listOfEnvSlugs := []string{}
	mapOfEnvSlugs := make(map[string]interface{})

	for _, environment := range response.AccessibleEnvironments {
		listOfEnvSlugs = append(listOfEnvSlugs, environment.Slug)
		mapOfEnvSlugs[environment.Slug] = environment
	}

	_, exists := mapOfEnvSlugs[environmentName]
	if !exists {
		HandleError(fmt.Errorf("the environment [%s] does not exist in project with [id=%s]. Only [%s] are available", environmentName, workspaceId, strings.Join(listOfEnvSlugs, ",")))
	}

	return nil

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

func OverrideSecrets(secrets []models.SingleEnvironmentVariable, secretType string) []models.SingleEnvironmentVariable {
	personalSecrets := make(map[string]models.SingleEnvironmentVariable)
	sharedSecrets := make(map[string]models.SingleEnvironmentVariable)
	secretsToReturn := []models.SingleEnvironmentVariable{}
	secretsToReturnMap := make(map[string]models.SingleEnvironmentVariable)

	for _, secret := range secrets {
		if secret.Type == PERSONAL_SECRET_TYPE_NAME {
			personalSecrets[secret.Key] = secret
		}
		if secret.Type == SHARED_SECRET_TYPE_NAME {
			sharedSecrets[secret.Key] = secret
		}
	}

	if secretType == PERSONAL_SECRET_TYPE_NAME {
		for _, secret := range secrets {
			if personalSecret, exists := personalSecrets[secret.Key]; exists {
				secretsToReturnMap[secret.Key] = personalSecret
			} else {
				if _, exists = secretsToReturnMap[secret.Key]; !exists {
					secretsToReturnMap[secret.Key] = secret
				}
			}
		}
	} else if secretType == SHARED_SECRET_TYPE_NAME {
		for _, secret := range secrets {
			if sharedSecret, exists := sharedSecrets[secret.Key]; exists {
				secretsToReturnMap[secret.Key] = sharedSecret
			} else {
				if _, exists := secretsToReturnMap[secret.Key]; !exists {
					secretsToReturnMap[secret.Key] = secret
				}
			}
		}
	}

	for _, secret := range secretsToReturnMap {
		secretsToReturn = append(secretsToReturn, secret)
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

		// Decrypt comment
		comment_iv, err := base64.StdEncoding.DecodeString(secret.SecretCommentIV)
		if err != nil {
			return nil, fmt.Errorf("unable to decode secret IV for secret value")
		}

		comment_tag, err := base64.StdEncoding.DecodeString(secret.SecretCommentTag)
		if err != nil {
			return nil, fmt.Errorf("unable to decode secret authentication tag for secret value")
		}

		comment_ciphertext, _ := base64.StdEncoding.DecodeString(secret.SecretCommentCiphertext)
		if err != nil {
			return nil, fmt.Errorf("unable to decode secret cipher text for secret key")
		}

		plainTextComment, err := crypto.DecryptSymmetric(key, comment_ciphertext, comment_tag, comment_iv)
		if err != nil {
			return nil, fmt.Errorf("unable to symmetrically decrypt secret comment")
		}

		plainTextSecret := models.SingleEnvironmentVariable{
			Key:     string(plainTextKey),
			Value:   string(plainTextValue),
			Type:    string(secret.Type),
			ID:      secret.ID,
			Tags:    secret.Tags,
			Comment: string(plainTextComment),
		}

		plainTextSecrets = append(plainTextSecrets, plainTextSecret)
	}

	return plainTextSecrets, nil
}

func WriteBackupSecrets(workspace string, environment string, encryptionKey []byte, secrets []models.SingleEnvironmentVariable) error {
	fileName := fmt.Sprintf("secrets_%s_%s", workspace, environment)
	secrets_backup_folder_name := "secrets-backup"

	_, fullConfigFileDirPath, err := GetFullConfigFilePath()
	if err != nil {
		return fmt.Errorf("WriteBackupSecrets: unable to get full config folder path [err=%s]", err)
	}

	// create secrets backup directory
	fullPathToSecretsBackupFolder := fmt.Sprintf("%s/%s", fullConfigFileDirPath, secrets_backup_folder_name)
	if _, err := os.Stat(fullPathToSecretsBackupFolder); errors.Is(err, os.ErrNotExist) {
		err := os.Mkdir(fullPathToSecretsBackupFolder, os.ModePerm)
		if err != nil {
			return err
		}
	}

	var encryptedSecrets []models.SymmetricEncryptionResult
	for _, secret := range secrets {
		marshaledSecrets, _ := json.Marshal(secret)
		result, err := crypto.EncryptSymmetric(marshaledSecrets, encryptionKey)
		if err != nil {
			return err
		}

		encryptedSecrets = append(encryptedSecrets, result)
	}

	listOfSecretsMarshalled, _ := json.Marshal(encryptedSecrets)
	err = os.WriteFile(fmt.Sprintf("%s/%s", fullPathToSecretsBackupFolder, fileName), listOfSecretsMarshalled, 0600)
	if err != nil {
		return fmt.Errorf("WriteBackupSecrets: Unable to write backup secrets to file [err=%s]", err)
	}

	return nil
}

func ReadBackupSecrets(workspace string, environment string, encryptionKey []byte) ([]models.SingleEnvironmentVariable, error) {
	fileName := fmt.Sprintf("secrets_%s_%s", workspace, environment)
	secrets_backup_folder_name := "secrets-backup"

	_, fullConfigFileDirPath, err := GetFullConfigFilePath()
	if err != nil {
		return nil, fmt.Errorf("ReadBackupSecrets: unable to write config file because an error occurred when getting config file path [err=%s]", err)
	}

	fullPathToSecretsBackupFolder := fmt.Sprintf("%s/%s", fullConfigFileDirPath, secrets_backup_folder_name)
	if _, err := os.Stat(fullPathToSecretsBackupFolder); errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}

	encryptedBackupSecretsFilePath := fmt.Sprintf("%s/%s", fullPathToSecretsBackupFolder, fileName)

	encryptedBackupSecretsAsBytes, err := os.ReadFile(encryptedBackupSecretsFilePath)
	if err != nil {
		return nil, err
	}

	var listOfEncryptedBackupSecrets []models.SymmetricEncryptionResult

	_ = json.Unmarshal(encryptedBackupSecretsAsBytes, &listOfEncryptedBackupSecrets)

	var plainTextSecrets []models.SingleEnvironmentVariable
	for _, encryptedSecret := range listOfEncryptedBackupSecrets {
		result, err := crypto.DecryptSymmetric(encryptionKey, encryptedSecret.CipherText, encryptedSecret.AuthTag, encryptedSecret.Nonce)
		if err != nil {
			return nil, err
		}

		var plainTextSecret models.SingleEnvironmentVariable

		err = json.Unmarshal(result, &plainTextSecret)
		if err != nil {
			return nil, err
		}

		plainTextSecrets = append(plainTextSecrets, plainTextSecret)
	}

	return plainTextSecrets, nil

}

func DeleteBackupSecrets() error {
	secrets_backup_folder_name := "secrets-backup"

	_, fullConfigFileDirPath, err := GetFullConfigFilePath()
	if err != nil {
		return fmt.Errorf("ReadBackupSecrets: unable to write config file because an error occurred when getting config file path [err=%s]", err)
	}

	fullPathToSecretsBackupFolder := fmt.Sprintf("%s/%s", fullConfigFileDirPath, secrets_backup_folder_name)

	return os.RemoveAll(fullPathToSecretsBackupFolder)
}

func GetEnvFromWorkspaceFile() string {
	workspaceFile, err := GetWorkSpaceFromFile()
	if err != nil {
		log.Debugf("getEnvFromWorkspaceFile: [err=%s]", err)
		return ""
	}

	if env := GetEnvelopmentBasedOnGitBranch(workspaceFile); env != "" {
		return env
	}

	return workspaceFile.DefaultEnvironment
}

func GetEnvelopmentBasedOnGitBranch(workspaceFile models.WorkspaceConfigFile) string {
	branch, err := getCurrentBranch()
	if err != nil {
		log.Debugf("getEnvelopmentBasedOnGitBranch: [err=%s]", err)
	}

	envBasedOnGitBranch, ok := workspaceFile.GitBranchToEnvironmentMapping[branch]

	log.Debugf("GetEnvelopmentBasedOnGitBranch: [envBasedOnGitBranch=%s] [ok=%t]", envBasedOnGitBranch, ok)

	if err == nil && ok {
		return envBasedOnGitBranch
	} else {
		log.Debugf("getEnvelopmentBasedOnGitBranch: [err=%s]", err)
		return ""
	}
}
