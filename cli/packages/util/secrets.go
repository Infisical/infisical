package util

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"unicode"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/crypto"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/rs/zerolog/log"
	"github.com/zalando/go-keyring"
	"gopkg.in/yaml.v3"
)

func GetPlainTextSecretsViaServiceToken(fullServiceToken string, environment string, secretPath string, includeImports bool, recursive bool, tagSlugs string, expandSecretReferences bool) ([]models.SingleEnvironmentVariable, error) {
	serviceTokenParts := strings.SplitN(fullServiceToken, ".", 4)
	if len(serviceTokenParts) < 4 {
		return nil, fmt.Errorf("invalid service token entered. Please double check your service token and try again")
	}

	serviceToken := fmt.Sprintf("%v.%v.%v", serviceTokenParts[0], serviceTokenParts[1], serviceTokenParts[2])

	httpClient, err := GetRestyClientWithCustomHeaders()
	if err != nil {
		return nil, fmt.Errorf("unable to get client with custom headers [err=%v]", err)
	}

	httpClient.SetAuthToken(serviceToken).
		SetHeader("Accept", "application/json")

	serviceTokenDetails, err := api.CallGetServiceTokenDetailsV2(httpClient)
	if err != nil {
		return nil, fmt.Errorf("unable to get service token details. [err=%v]", err)
	}

	// if multiple scopes are there then user needs to specify which environment and secret path
	if environment == "" {
		if len(serviceTokenDetails.Scopes) != 1 {
			return nil, fmt.Errorf("you need to provide the --env for multiple environment scoped token")
		} else {
			environment = serviceTokenDetails.Scopes[0].Environment
		}
	}

	rawSecrets, err := api.CallGetRawSecretsV3(httpClient, api.GetRawSecretsV3Request{
		WorkspaceId:            serviceTokenDetails.Workspace,
		Environment:            environment,
		SecretPath:             secretPath,
		IncludeImport:          includeImports,
		Recursive:              recursive,
		TagSlugs:               tagSlugs,
		ExpandSecretReferences: expandSecretReferences,
	})

	if err != nil {
		return nil, err
	}

	plainTextSecrets := []models.SingleEnvironmentVariable{}

	for _, secret := range rawSecrets.Secrets {
		plainTextSecrets = append(plainTextSecrets, models.SingleEnvironmentVariable{Key: secret.SecretKey, Value: secret.SecretValue, Type: secret.Type, WorkspaceId: secret.Workspace})
	}

	if includeImports {
		plainTextSecrets, err = InjectRawImportedSecret(plainTextSecrets, rawSecrets.Imports)
		if err != nil {
			return nil, err
		}
	}

	return plainTextSecrets, nil

}

func GetPlainTextSecretsV3(accessToken string, workspaceId string, environmentName string, secretsPath string, includeImports bool, recursive bool, tagSlugs string, expandSecretReferences bool) (models.PlaintextSecretResult, error) {
	httpClient, err := GetRestyClientWithCustomHeaders()
	if err != nil {
		return models.PlaintextSecretResult{}, err
	}

	httpClient.SetAuthToken(accessToken).
		SetHeader("Accept", "application/json")

	getSecretsRequest := api.GetRawSecretsV3Request{
		WorkspaceId:            workspaceId,
		Environment:            environmentName,
		IncludeImport:          includeImports,
		Recursive:              recursive,
		TagSlugs:               tagSlugs,
		ExpandSecretReferences: expandSecretReferences,
	}

	if secretsPath != "" {
		getSecretsRequest.SecretPath = secretsPath
	}

	rawSecrets, err := api.CallGetRawSecretsV3(httpClient, getSecretsRequest)

	if err != nil {
		return models.PlaintextSecretResult{}, err
	}

	plainTextSecrets := []models.SingleEnvironmentVariable{}

	for _, secret := range rawSecrets.Secrets {
		plainTextSecrets = append(plainTextSecrets, models.SingleEnvironmentVariable{Key: secret.SecretKey, Value: secret.SecretValue, Type: secret.Type, WorkspaceId: secret.Workspace, SecretPath: secret.SecretPath})
	}

	if includeImports {
		plainTextSecrets, err = InjectRawImportedSecret(plainTextSecrets, rawSecrets.Imports)
		if err != nil {
			return models.PlaintextSecretResult{}, err
		}
	}

	return models.PlaintextSecretResult{
		Secrets: plainTextSecrets,
		Etag:    rawSecrets.ETag,
	}, nil
}

func GetSinglePlainTextSecretByNameV3(accessToken string, workspaceId string, environmentName string, secretsPath string, secretName string) (models.SingleEnvironmentVariable, string, error) {
	httpClient, err := GetRestyClientWithCustomHeaders()
	if err != nil {
		return models.SingleEnvironmentVariable{}, "", err
	}

	httpClient.SetAuthToken(accessToken).
		SetHeader("Accept", "application/json")

	getSecretsRequest := api.GetRawSecretV3ByNameRequest{
		WorkspaceID: workspaceId,
		Environment: environmentName,
		SecretName:  secretName,
		SecretPath:  secretsPath,
	}

	rawSecret, err := api.CallFetchSingleSecretByName(httpClient, getSecretsRequest)

	if err != nil {
		return models.SingleEnvironmentVariable{}, "", err
	}

	formattedSecrets := models.SingleEnvironmentVariable{
		Key:         rawSecret.Secret.SecretKey,
		WorkspaceId: rawSecret.Secret.Workspace,
		Value:       rawSecret.Secret.SecretValue,
		Type:        rawSecret.Secret.Type,
		ID:          rawSecret.Secret.ID,
		Comment:     rawSecret.Secret.SecretComment,
		SecretPath:  rawSecret.Secret.SecretPath,
	}

	return formattedSecrets, rawSecret.ETag, nil
}

func CreateDynamicSecretLease(accessToken string, projectSlug string, environmentName string, secretsPath string, slug string, ttl string) (models.DynamicSecretLease, error) {
	httpClient, err := GetRestyClientWithCustomHeaders()
	if err != nil {
		return models.DynamicSecretLease{}, err
	}

	httpClient.SetAuthToken(accessToken).
		SetHeader("Accept", "application/json")

	dynamicSecretRequest := api.CreateDynamicSecretLeaseV1Request{
		ProjectSlug: projectSlug,
		Environment: environmentName,
		SecretPath:  secretsPath,
		Slug:        slug,
		TTL:         ttl,
	}

	dynamicSecret, err := api.CallCreateDynamicSecretLeaseV1(httpClient, dynamicSecretRequest)
	if err != nil {
		return models.DynamicSecretLease{}, err
	}

	return models.DynamicSecretLease{
		Lease:         dynamicSecret.Lease,
		Data:          dynamicSecret.Data,
		DynamicSecret: dynamicSecret.DynamicSecret,
	}, nil
}

func InjectRawImportedSecret(secrets []models.SingleEnvironmentVariable, importedSecrets []api.ImportedRawSecretV3) ([]models.SingleEnvironmentVariable, error) {
	if importedSecrets == nil {
		return secrets, nil
	}

	hasOverriden := make(map[string]bool)
	for _, sec := range secrets {
		hasOverriden[sec.Key] = true
	}

	for i := len(importedSecrets) - 1; i >= 0; i-- {
		importSec := importedSecrets[i]
		plainTextImportedSecrets := importSec.Secrets

		for _, sec := range plainTextImportedSecrets {
			if _, ok := hasOverriden[sec.SecretKey]; !ok {
				secrets = append(secrets, models.SingleEnvironmentVariable{
					Key:         sec.SecretKey,
					WorkspaceId: sec.Workspace,
					Value:       sec.SecretValue,
					Type:        sec.Type,
					ID:          sec.ID,
				})
				hasOverriden[sec.SecretKey] = true
			}
		}
	}
	return secrets, nil
}

func FilterSecretsByTag(plainTextSecrets []models.SingleEnvironmentVariable, tagSlugs string) []models.SingleEnvironmentVariable {
	if tagSlugs == "" {
		return plainTextSecrets
	}

	tagSlugsMap := make(map[string]bool)
	tagSlugsList := strings.Split(tagSlugs, ",")
	for _, slug := range tagSlugsList {
		tagSlugsMap[slug] = true
	}

	filteredSecrets := []models.SingleEnvironmentVariable{}
	for _, secret := range plainTextSecrets {
		for _, tag := range secret.Tags {
			if tagSlugsMap[tag.Slug] {
				filteredSecrets = append(filteredSecrets, secret)
				break
			}
		}
	}

	return filteredSecrets
}

func GetAllEnvironmentVariables(params models.GetAllSecretsParameters, projectConfigFilePath string) ([]models.SingleEnvironmentVariable, error) {
	var secretsToReturn []models.SingleEnvironmentVariable
	// var serviceTokenDetails api.GetServiceTokenDetailsResponse
	var errorToReturn error

	if params.InfisicalToken == "" && params.UniversalAuthAccessToken == "" {
		if params.WorkspaceId == "" {
			if projectConfigFilePath == "" {
				_, err := GetWorkSpaceFromFile()
				if err != nil {
					PrintErrorMessageAndExit("Please either run infisical init to connect to a project or pass in project id with --projectId flag")
				}
			} else {
				ValidateWorkspaceFile(projectConfigFilePath)
			}
		}

		RequireLogin()

		log.Debug().Msg("GetAllEnvironmentVariables: Trying to fetch secrets using logged in details")

		loggedInUserDetails, err := GetCurrentLoggedInUserDetails(true)
		isConnected := ValidateInfisicalAPIConnection()

		if isConnected {
			log.Debug().Msg("GetAllEnvironmentVariables: Connected to Infisical instance, checking logged in creds")
		}

		if err != nil {
			return nil, err
		}

		if isConnected && loggedInUserDetails.LoginExpired {
			loggedInUserDetails = EstablishUserLoginSession()
		}

		if params.WorkspaceId == "" {
			var infisicalDotJson models.WorkspaceConfigFile

			if projectConfigFilePath == "" {
				projectConfig, err := GetWorkSpaceFromFile()
				if err != nil {
					PrintErrorMessageAndExit("Please either run infisical init to connect to a project or pass in project id with --projectId flag")
				}

				infisicalDotJson = projectConfig
			} else {
				projectConfig, err := GetWorkSpaceFromFilePath(projectConfigFilePath)
				if err != nil {
					return nil, err
				}

				infisicalDotJson = projectConfig
			}
			params.WorkspaceId = infisicalDotJson.WorkspaceId
		}

		res, err := GetPlainTextSecretsV3(loggedInUserDetails.UserCredentials.JTWToken, params.WorkspaceId,
			params.Environment, params.SecretsPath, params.IncludeImport, params.Recursive, params.TagSlugs, true)
		log.Debug().Msgf("GetAllEnvironmentVariables: Trying to fetch secrets JTW token [err=%s]", err)

		if err == nil {
			backupEncryptionKey, err := GetBackupEncryptionKey()
			if err != nil {
				return nil, err
			}
			WriteBackupSecrets(params.WorkspaceId, params.Environment, params.SecretsPath, backupEncryptionKey, res.Secrets)
		}

		secretsToReturn = res.Secrets
		errorToReturn = err
		// only attempt to serve cached secrets if no internet connection and if at least one secret cached
		if !isConnected {
			backupEncryptionKey, _ := GetBackupEncryptionKey()
			if backupEncryptionKey != nil {
				backedUpSecrets, err := ReadBackupSecrets(params.WorkspaceId, params.Environment, params.SecretsPath, backupEncryptionKey)
				if len(backedUpSecrets) > 0 {
					PrintWarning("Unable to fetch the latest secret(s) due to connection error, serving secrets from last successful fetch. For more info, run with --debug")
					secretsToReturn = backedUpSecrets
					errorToReturn = err
				}
			}
		}

	} else {
		if params.InfisicalToken != "" {
			log.Debug().Msg("Trying to fetch secrets using service token")
			secretsToReturn, errorToReturn = GetPlainTextSecretsViaServiceToken(params.InfisicalToken, params.Environment, params.SecretsPath, params.IncludeImport, params.Recursive, params.TagSlugs, params.ExpandSecretReferences)
		} else if params.UniversalAuthAccessToken != "" {

			if params.WorkspaceId == "" {
				PrintErrorMessageAndExit("Project ID is required when using machine identity")
			}

			log.Debug().Msg("Trying to fetch secrets using universal auth")
			res, err := GetPlainTextSecretsV3(params.UniversalAuthAccessToken, params.WorkspaceId, params.Environment, params.SecretsPath, params.IncludeImport, params.Recursive, params.TagSlugs, params.ExpandSecretReferences)

			errorToReturn = err
			secretsToReturn = res.Secrets
		}
	}

	return secretsToReturn, errorToReturn
}

func getSecretsByKeys(secrets []models.SingleEnvironmentVariable) map[string]models.SingleEnvironmentVariable {
	secretMapByName := make(map[string]models.SingleEnvironmentVariable, len(secrets))

	for _, secret := range secrets {
		secretMapByName[secret.Key] = secret
	}

	return secretMapByName
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

func GetBackupEncryptionKey() ([]byte, error) {
	encryptionKey, err := GetValueInKeyring(INFISICAL_BACKUP_SECRET_ENCRYPTION_KEY)
	if err != nil {
		if err == keyring.ErrUnsupportedPlatform {
			return nil, errors.New("your OS does not support keyring. Consider using a service token https://infisical.com/docs/documentation/platform/token")
		} else if err == keyring.ErrNotFound {
			// generate a new key
			randomizedKey := make([]byte, 16)
			rand.Read(randomizedKey)
			encryptionKey = hex.EncodeToString(randomizedKey)
			if err := SetValueInKeyring(INFISICAL_BACKUP_SECRET_ENCRYPTION_KEY, encryptionKey); err != nil {
				return nil, err
			}
			return []byte(encryptionKey), nil
		} else {
			return nil, fmt.Errorf("something went wrong, failed to retrieve value from system keyring [error=%v]", err)
		}
	}
	return []byte(encryptionKey), nil
}

func WriteBackupSecrets(workspace string, environment string, secretsPath string, encryptionKey []byte, secrets []models.SingleEnvironmentVariable) error {
	formattedPath := strings.ReplaceAll(secretsPath, "/", "-")
	fileName := fmt.Sprintf("project_secrets_%s_%s_%s.json", workspace, environment, formattedPath)
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
	marshaledSecrets, _ := json.Marshal(secrets)
	result, err := crypto.EncryptSymmetric(marshaledSecrets, encryptionKey)
	if err != nil {
		return fmt.Errorf("WriteBackupSecrets: Unable to encrypt local secret backup to file [err=%s]", err)
	}
	listOfSecretsMarshalled, _ := json.Marshal(result)
	err = os.WriteFile(fmt.Sprintf("%s/%s", fullPathToSecretsBackupFolder, fileName), listOfSecretsMarshalled, 0600)
	if err != nil {
		return fmt.Errorf("WriteBackupSecrets: Unable to write backup secrets to file [err=%s]", err)
	}

	return nil
}

func ReadBackupSecrets(workspace string, environment string, secretsPath string, encryptionKey []byte) ([]models.SingleEnvironmentVariable, error) {
	formattedPath := strings.ReplaceAll(secretsPath, "/", "-")
	fileName := fmt.Sprintf("project_secrets_%s_%s_%s.json", workspace, environment, formattedPath)
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

	var encryptedBackUpSecrets models.SymmetricEncryptionResult
	err = json.Unmarshal(encryptedBackupSecretsAsBytes, &encryptedBackUpSecrets)
	if err != nil {
		return nil, fmt.Errorf("ReadBackupSecrets: unable to parse encrypted backup secrets. The secrets backup may be malformed [err=%s]", err)
	}

	result, err := crypto.DecryptSymmetric(encryptionKey, encryptedBackUpSecrets.CipherText, encryptedBackUpSecrets.AuthTag, encryptedBackUpSecrets.Nonce)
	if err != nil {
		return nil, fmt.Errorf("ReadBackupSecrets: unable to decrypt encrypted backup secrets [err=%s]", err)
	}
	var plainTextSecrets []models.SingleEnvironmentVariable
	_ = json.Unmarshal(result, &plainTextSecrets)

	return plainTextSecrets, nil

}

func DeleteBackupSecrets() error {
	secrets_backup_folder_name := "secrets-backup"

	_, fullConfigFileDirPath, err := GetFullConfigFilePath()
	if err != nil {
		return fmt.Errorf("ReadBackupSecrets: unable to write config file because an error occurred when getting config file path [err=%s]", err)
	}

	fullPathToSecretsBackupFolder := fmt.Sprintf("%s/%s", fullConfigFileDirPath, secrets_backup_folder_name)
	DeleteValueInKeyring(INFISICAL_BACKUP_SECRET)
	DeleteValueInKeyring(INFISICAL_BACKUP_SECRET_ENCRYPTION_KEY)

	return os.RemoveAll(fullPathToSecretsBackupFolder)
}

func GetEnvFromWorkspaceFile() string {
	workspaceFile, err := GetWorkSpaceFromFile()
	if err != nil {
		log.Debug().Msgf("getEnvFromWorkspaceFile: [err=%s]", err)
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
		log.Debug().Msgf("getEnvelopmentBasedOnGitBranch: [err=%s]", err)
	}

	envBasedOnGitBranch, ok := workspaceFile.GitBranchToEnvironmentMapping[branch]

	log.Debug().Msgf("GetEnvelopmentBasedOnGitBranch: [envBasedOnGitBranch=%s] [ok=%t]", envBasedOnGitBranch, ok)

	if err == nil && ok {
		return envBasedOnGitBranch
	} else {
		log.Debug().Msgf("getEnvelopmentBasedOnGitBranch: [err=%s]", err)
		return ""
	}
}

func GetPlainTextWorkspaceKey(authenticationToken string, receiverPrivateKey string, workspaceId string) ([]byte, error) {
	httpClient, err := GetRestyClientWithCustomHeaders()
	if err != nil {
		return nil, fmt.Errorf("GetPlainTextWorkspaceKey: unable to get client with custom headers [err=%v]", err)
	}

	httpClient.SetAuthToken(authenticationToken).
		SetHeader("Accept", "application/json")

	request := api.GetEncryptedWorkspaceKeyRequest{
		WorkspaceId: workspaceId,
	}

	workspaceKeyResponse, err := api.CallGetEncryptedWorkspaceKey(httpClient, request)
	if err != nil {
		return nil, fmt.Errorf("GetPlainTextWorkspaceKey: unable to retrieve your encrypted workspace key. [err=%v]", err)
	}

	encryptedWorkspaceKey, err := base64.StdEncoding.DecodeString(workspaceKeyResponse.EncryptedKey)
	if err != nil {
		return nil, fmt.Errorf("GetPlainTextWorkspaceKey: Unable to get bytes represented by the base64 for encryptedWorkspaceKey [err=%v]", err)
	}

	encryptedWorkspaceKeySenderPublicKey, err := base64.StdEncoding.DecodeString(workspaceKeyResponse.Sender.PublicKey)
	if err != nil {
		return nil, fmt.Errorf("GetPlainTextWorkspaceKey: Unable to get bytes represented by the base64 for encryptedWorkspaceKeySenderPublicKey [err=%v]", err)
	}

	encryptedWorkspaceKeyNonce, err := base64.StdEncoding.DecodeString(workspaceKeyResponse.Nonce)
	if err != nil {
		return nil, fmt.Errorf("GetPlainTextWorkspaceKey: Unable to get bytes represented by the base64 for encryptedWorkspaceKeyNonce [err=%v]", err)
	}

	currentUsersPrivateKey, err := base64.StdEncoding.DecodeString(receiverPrivateKey)
	if err != nil {
		return nil, fmt.Errorf("GetPlainTextWorkspaceKey: Unable to get bytes represented by the base64 for currentUsersPrivateKey [err=%v]", err)
	}

	if len(currentUsersPrivateKey) == 0 || len(encryptedWorkspaceKeySenderPublicKey) == 0 {
		return nil, fmt.Errorf("GetPlainTextWorkspaceKey: Missing credentials for generating plainTextEncryptionKey")
	}

	return crypto.DecryptAsymmetric(encryptedWorkspaceKey, encryptedWorkspaceKeyNonce, encryptedWorkspaceKeySenderPublicKey, currentUsersPrivateKey), nil
}

func parseSecrets(fileName string, content string) (map[string]string, error) {
	secrets := make(map[string]string)

	if strings.HasSuffix(fileName, ".yaml") || strings.HasSuffix(fileName, ".yml") {
		// Handle YAML secrets
		var yamlData map[string]interface{}
		if err := yaml.Unmarshal([]byte(content), &yamlData); err != nil {
			return nil, fmt.Errorf("failed to parse YAML file: %v", err)
		}

		for key, value := range yamlData {
			if strValue, ok := value.(string); ok {
				secrets[key] = strValue
			} else {
				return nil, fmt.Errorf("YAML secret '%s' must be a string", key)
			}
		}
	} else {
		// Handle .env files
		lines := strings.Split(content, "\n")

		for _, line := range lines {
			line = strings.TrimSpace(line)

			// Ignore empty lines and comments
			if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "//") {
				continue
			}

			// Ensure it's a valid key=value pair
			splitKeyValue := strings.SplitN(line, "=", 2)
			if len(splitKeyValue) != 2 {
				return nil, fmt.Errorf("invalid format, expected key=value in line: %s", line)
			}

			key, value := strings.TrimSpace(splitKeyValue[0]), strings.TrimSpace(splitKeyValue[1])

			// Handle quoted values
			if (strings.HasPrefix(value, `"`) && strings.HasSuffix(value, `"`)) ||
				(strings.HasPrefix(value, `'`) && strings.HasSuffix(value, `'`)) {
				value = value[1 : len(value)-1] // Remove surrounding quotes
			}

			secrets[key] = value
		}
	}

	return secrets, nil
}

func validateSecretKey(key string) error {
	if key == "" {
		return errors.New("secret keys cannot be empty")
	}
	if unicode.IsNumber(rune(key[0])) {
		return fmt.Errorf("secret key '%s' cannot start with a number", key)
	}
	if strings.Contains(key, " ") {
		return fmt.Errorf("secret key '%s' cannot contain spaces", key)
	}
	return nil
}

func SetRawSecrets(secretArgs []string, secretType string, environmentName string, secretsPath string, projectId string, tokenDetails *models.TokenDetails, file string) ([]models.SecretSetOperation, error) {
	if file != "" {
		content, err := os.ReadFile(file)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				PrintErrorMessageAndExit("File does not exist")
			}
			return nil, fmt.Errorf("unable to process file [err=%v]", err)
		}

		parsedSecrets, err := parseSecrets(file, string(content))
		if err != nil {
			PrintErrorMessageAndExit(fmt.Sprintf("error parsing secrets: %v", err))
		}

		// Step 2: Validate secrets
		for key, value := range parsedSecrets {
			if err := validateSecretKey(key); err != nil {
				PrintErrorMessageAndExit(err.Error())
			}
			if strings.TrimSpace(value) == "" {
				PrintErrorMessageAndExit(fmt.Sprintf("Secret key '%s' has an empty value", key))
			}
			secretArgs = append(secretArgs, fmt.Sprintf("%s=%s", key, value))
		}

		if len(secretArgs) == 0 {
			PrintErrorMessageAndExit("no valid secrets found in the file")
		}
	}

	if tokenDetails == nil {
		return nil, fmt.Errorf("unable to process set secret operations, token details are missing")
	}

	getAllEnvironmentVariablesRequest := models.GetAllSecretsParameters{Environment: environmentName, SecretsPath: secretsPath, WorkspaceId: projectId}
	if tokenDetails.Type == UNIVERSAL_AUTH_TOKEN_IDENTIFIER {
		getAllEnvironmentVariablesRequest.UniversalAuthAccessToken = tokenDetails.Token
	}

	if tokenDetails.Type == SERVICE_TOKEN_IDENTIFIER {
		getAllEnvironmentVariablesRequest.InfisicalToken = tokenDetails.Token
	}

	httpClient, err := GetRestyClientWithCustomHeaders()
	if err != nil {
		return nil, fmt.Errorf("unable to get client with custom headers [err=%v]", err)
	}
	httpClient.SetAuthToken(tokenDetails.Token)
	httpClient.SetHeader("Accept", "application/json")

	// pull current secrets
	secrets, err := GetAllEnvironmentVariables(getAllEnvironmentVariablesRequest, "")
	if err != nil {
		return nil, fmt.Errorf("unable to retrieve secrets [err=%v]", err)
	}

	secretsToCreate := []api.RawSecret{}
	secretsToModify := []api.RawSecret{}
	secretOperations := []models.SecretSetOperation{}

	sharedSecretMapByName := make(map[string]models.SingleEnvironmentVariable, len(secrets))
	personalSecretMapByName := make(map[string]models.SingleEnvironmentVariable, len(secrets))

	for _, secret := range secrets {
		if secret.Type == SECRET_TYPE_PERSONAL {
			personalSecretMapByName[secret.Key] = secret
		} else {
			sharedSecretMapByName[secret.Key] = secret
		}
	}

	for _, arg := range secretArgs {
		splitKeyValueFromArg := strings.SplitN(arg, "=", 2)
		if splitKeyValueFromArg[0] == "" || splitKeyValueFromArg[1] == "" {
			PrintErrorMessageAndExit("ensure that each secret has a none empty key and value. Modify the input and try again")
		}

		if unicode.IsNumber(rune(splitKeyValueFromArg[0][0])) {
			PrintErrorMessageAndExit("keys of secrets cannot start with a number. Modify the key name(s) and try again")
		}

		// Key and value from argument
		key := splitKeyValueFromArg[0]
		value := splitKeyValueFromArg[1]

		var existingSecret models.SingleEnvironmentVariable
		var doesSecretExist bool

		if secretType == SECRET_TYPE_SHARED {
			existingSecret, doesSecretExist = sharedSecretMapByName[key]
		} else {
			existingSecret, doesSecretExist = personalSecretMapByName[key]
		}

		if doesSecretExist {
			// case: secret exists in project so it needs to be modified
			encryptedSecretDetails := api.RawSecret{
				ID:          existingSecret.ID,
				SecretValue: value,
				SecretKey:   key,
				Type:        existingSecret.Type,
			}

			// Only add to modifications if the value is different
			if existingSecret.Value != value {
				secretsToModify = append(secretsToModify, encryptedSecretDetails)
				secretOperations = append(secretOperations, models.SecretSetOperation{
					SecretKey:       key,
					SecretValue:     value,
					SecretOperation: "SECRET VALUE MODIFIED",
				})
			} else {
				// Current value is same as existing so no change
				secretOperations = append(secretOperations, models.SecretSetOperation{
					SecretKey:       key,
					SecretValue:     value,
					SecretOperation: "SECRET VALUE UNCHANGED",
				})
			}

		} else {
			// case: secret doesn't exist in project so it needs to be created
			encryptedSecretDetails := api.RawSecret{
				SecretKey:   key,
				SecretValue: value,
				Type:        secretType,
			}
			secretsToCreate = append(secretsToCreate, encryptedSecretDetails)
			secretOperations = append(secretOperations, models.SecretSetOperation{
				SecretKey:       key,
				SecretValue:     value,
				SecretOperation: "SECRET CREATED",
			})
		}
	}

	for _, secret := range secretsToCreate {
		createSecretRequest := api.CreateRawSecretV3Request{
			SecretName:  secret.SecretKey,
			SecretValue: secret.SecretValue,
			Type:        secret.Type,
			SecretPath:  secretsPath,
			WorkspaceID: projectId,
			Environment: environmentName,
		}

		err = api.CallCreateRawSecretsV3(httpClient, createSecretRequest)
		if err != nil {
			return nil, fmt.Errorf("unable to process new secret creations [err=%v]", err)
		}
	}

	for _, secret := range secretsToModify {
		updateSecretRequest := api.UpdateRawSecretByNameV3Request{
			SecretName:  secret.SecretKey,
			SecretValue: secret.SecretValue,
			SecretPath:  secretsPath,
			WorkspaceID: projectId,
			Environment: environmentName,
			Type:        secret.Type,
		}

		err = api.CallUpdateRawSecretsV3(httpClient, updateSecretRequest)
		if err != nil {
			return nil, fmt.Errorf("unable to process secret update request [err=%v]", err)
		}
	}

	return secretOperations, nil

}
