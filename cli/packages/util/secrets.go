package util

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"regexp"
	"slices"
	"strings"
	"unicode"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/crypto"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/go-resty/resty/v2"
	"github.com/rs/zerolog/log"
	"github.com/zalando/go-keyring"
)

func GetPlainTextSecretsViaServiceToken(fullServiceToken string, environment string, secretPath string, includeImports bool, recursive bool) ([]models.SingleEnvironmentVariable, error) {
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

	// if multiple scopes are there then user needs to specify which environment and secret path
	if environment == "" {
		if len(serviceTokenDetails.Scopes) != 1 {
			return nil, fmt.Errorf("you need to provide the --env for multiple environment scoped token")
		} else {
			environment = serviceTokenDetails.Scopes[0].Environment
		}
	}

	rawSecrets, err := api.CallGetRawSecretsV3(httpClient, api.GetRawSecretsV3Request{
		WorkspaceId:   serviceTokenDetails.Workspace,
		Environment:   environment,
		SecretPath:    secretPath,
		IncludeImport: includeImports,
		Recursive:     recursive,
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

func GetPlainTextSecretsV3(accessToken string, workspaceId string, environmentName string, secretsPath string, includeImports bool, recursive bool) (models.PlaintextSecretResult, error) {
	httpClient := resty.New()
	httpClient.SetAuthToken(accessToken).
		SetHeader("Accept", "application/json")

	getSecretsRequest := api.GetRawSecretsV3Request{
		WorkspaceId:   workspaceId,
		Environment:   environmentName,
		IncludeImport: includeImports,
		Recursive:     recursive,
		// TagSlugs:    tagSlugs,
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
		plainTextSecrets = append(plainTextSecrets, models.SingleEnvironmentVariable{Key: secret.SecretKey, Value: secret.SecretValue, Type: secret.Type, WorkspaceId: secret.Workspace})
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
	httpClient := resty.New()
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
	}

	return formattedSecrets, rawSecret.ETag, nil
}

func CreateDynamicSecretLease(accessToken string, projectSlug string, environmentName string, secretsPath string, slug string, ttl string) (models.DynamicSecretLease, error) {
	httpClient := resty.New()
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
		if projectConfigFilePath == "" {
			RequireLocalWorkspaceFile()
		} else {
			ValidateWorkspaceFile(projectConfigFilePath)
		}

		RequireLogin()

		log.Debug().Msg("GetAllEnvironmentVariables: Trying to fetch secrets using logged in details")

		loggedInUserDetails, err := GetCurrentLoggedInUserDetails()
		isConnected := ValidateInfisicalAPIConnection()

		if isConnected {
			log.Debug().Msg("GetAllEnvironmentVariables: Connected to Infisical instance, checking logged in creds")
		}

		if err != nil {
			return nil, err
		}

		if isConnected && loggedInUserDetails.LoginExpired {
			PrintErrorMessageAndExit("Your login session has expired, please run [infisical login] and try again")
		}

		var infisicalDotJson models.WorkspaceConfigFile

		if projectConfigFilePath == "" {
			projectConfig, err := GetWorkSpaceFromFile()
			if err != nil {
				return nil, err
			}

			infisicalDotJson = projectConfig
		} else {
			projectConfig, err := GetWorkSpaceFromFilePath(projectConfigFilePath)
			if err != nil {
				return nil, err
			}

			infisicalDotJson = projectConfig
		}

		if params.WorkspaceId != "" {
			infisicalDotJson.WorkspaceId = params.WorkspaceId
		}

		res, err := GetPlainTextSecretsV3(loggedInUserDetails.UserCredentials.JTWToken, infisicalDotJson.WorkspaceId,
			params.Environment, params.SecretsPath, params.IncludeImport, params.Recursive)
		log.Debug().Msgf("GetAllEnvironmentVariables: Trying to fetch secrets JTW token [err=%s]", err)

		if err == nil {
			WriteBackupSecrets(infisicalDotJson.WorkspaceId, params.Environment, params.SecretsPath, res.Secrets)
		}

		secretsToReturn = res.Secrets
		errorToReturn = err
		// only attempt to serve cached secrets if no internet connection and if at least one secret cached
		if !isConnected {
			backedSecrets, err := ReadBackupSecrets(infisicalDotJson.WorkspaceId, params.Environment, params.SecretsPath)
			if len(backedSecrets) > 0 {
				PrintWarning("Unable to fetch latest secret(s) due to connection error, serving secrets from last successful fetch. For more info, run with --debug")
				secretsToReturn = backedSecrets
				errorToReturn = err
			}
		}

	} else {
		if params.InfisicalToken != "" {
			log.Debug().Msg("Trying to fetch secrets using service token")
			secretsToReturn, errorToReturn = GetPlainTextSecretsViaServiceToken(params.InfisicalToken, params.Environment, params.SecretsPath, params.IncludeImport, params.Recursive)
		} else if params.UniversalAuthAccessToken != "" {

			if params.WorkspaceId == "" {
				PrintErrorMessageAndExit("Project ID is required when using machine identity")
			}

			log.Debug().Msg("Trying to fetch secrets using universal auth")
			res, err := GetPlainTextSecretsV3(params.UniversalAuthAccessToken, params.WorkspaceId, params.Environment, params.SecretsPath, params.IncludeImport, params.Recursive)

			errorToReturn = err
			secretsToReturn = res.Secrets
		}
	}

	return secretsToReturn, errorToReturn
}

var secRefRegex = regexp.MustCompile(`\${([^\}]*)}`)

func recursivelyExpandSecret(expandedSecs map[string]string, interpolatedSecs map[string]string, crossSecRefFetch func(env string, path []string, key string) string, key string) string {
	if v, ok := expandedSecs[key]; ok {
		return v
	}

	interpolatedVal, ok := interpolatedSecs[key]
	if !ok {
		HandleError(fmt.Errorf("could not find refered secret -  %s", key), "Kindly check whether its provided")
	}

	refs := secRefRegex.FindAllStringSubmatch(interpolatedVal, -1)
	for _, val := range refs {
		// key: "${something}" val: [${something},something]
		interpolatedExp, interpolationKey := val[0], val[1]
		ref := strings.Split(interpolationKey, ".")

		// ${KEY1} => [key1]
		if len(ref) == 1 {
			val := recursivelyExpandSecret(expandedSecs, interpolatedSecs, crossSecRefFetch, interpolationKey)
			interpolatedVal = strings.ReplaceAll(interpolatedVal, interpolatedExp, val)
			continue
		}

		// cross board reference ${env.folder.key1} => [env folder key1]
		if len(ref) > 1 {
			secEnv, tmpSecPath, secKey := ref[0], ref[1:len(ref)-1], ref[len(ref)-1]
			interpolatedSecs[interpolationKey] = crossSecRefFetch(secEnv, tmpSecPath, secKey) // get the reference value
			val := recursivelyExpandSecret(expandedSecs, interpolatedSecs, crossSecRefFetch, interpolationKey)
			interpolatedVal = strings.ReplaceAll(interpolatedVal, interpolatedExp, val)
		}

	}
	expandedSecs[key] = interpolatedVal
	return interpolatedVal
}

func getSecretsByKeys(secrets []models.SingleEnvironmentVariable) map[string]models.SingleEnvironmentVariable {
	secretMapByName := make(map[string]models.SingleEnvironmentVariable, len(secrets))

	for _, secret := range secrets {
		secretMapByName[secret.Key] = secret
	}

	return secretMapByName
}

func ExpandSecrets(secrets []models.SingleEnvironmentVariable, auth models.ExpandSecretsAuthentication, projectConfigPathDir string) []models.SingleEnvironmentVariable {
	expandedSecs := make(map[string]string)
	interpolatedSecs := make(map[string]string)
	// map[env.secret-path][keyname]Secret
	crossEnvRefSecs := make(map[string]map[string]models.SingleEnvironmentVariable) // a cache to hold all cross board reference secrets

	for _, sec := range secrets {
		// get all references in a secret
		refs := secRefRegex.FindAllStringSubmatch(sec.Value, -1)
		// nil means its a secret without reference
		if refs == nil {
			expandedSecs[sec.Key] = sec.Value // atomic secrets without any interpolation
		} else {
			interpolatedSecs[sec.Key] = sec.Value
		}
	}

	for i, sec := range secrets {
		// already present pick that up
		if expandedVal, ok := expandedSecs[sec.Key]; ok {
			secrets[i].Value = expandedVal
			continue
		}

		expandedVal := recursivelyExpandSecret(expandedSecs, interpolatedSecs, func(env string, secPaths []string, secKey string) string {
			secPaths = append([]string{"/"}, secPaths...)
			secPath := path.Join(secPaths...)

			secPathDot := strings.Join(secPaths, ".")
			uniqKey := fmt.Sprintf("%s.%s", env, secPathDot)

			if crossRefSec, ok := crossEnvRefSecs[uniqKey]; !ok {

				var refSecs []models.SingleEnvironmentVariable
				var err error

				// if not in cross reference cache, fetch it from server
				if auth.InfisicalToken != "" {
					refSecs, err = GetAllEnvironmentVariables(models.GetAllSecretsParameters{Environment: env, InfisicalToken: auth.InfisicalToken, SecretsPath: secPath}, projectConfigPathDir)
				} else if auth.UniversalAuthAccessToken != "" {
					refSecs, err = GetAllEnvironmentVariables((models.GetAllSecretsParameters{Environment: env, UniversalAuthAccessToken: auth.UniversalAuthAccessToken, SecretsPath: secPath, WorkspaceId: sec.WorkspaceId}), projectConfigPathDir)
				} else if IsLoggedIn() {
					refSecs, err = GetAllEnvironmentVariables(models.GetAllSecretsParameters{Environment: env, SecretsPath: secPath}, projectConfigPathDir)
				} else {
					HandleError(errors.New("no authentication provided"), "Please provide authentication to fetch secrets")
				}
				if err != nil {
					HandleError(err, fmt.Sprintf("Could not fetch secrets in environment: %s secret-path: %s", env, secPath), "If you are using a service token to fetch secrets, please ensure it is valid")
				}
				refSecsByKey := getSecretsByKeys(refSecs)
				// save it to avoid calling api again for same environment and folder path
				crossEnvRefSecs[uniqKey] = refSecsByKey
				return refSecsByKey[secKey].Value

			} else {
				return crossRefSec[secKey].Value
			}
		}, sec.Key)

		secrets[i].Value = expandedVal
	}
	return secrets
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

func WriteBackupSecrets(workspace string, environment string, secretsPath string, secrets []models.SingleEnvironmentVariable) error {
	var backedUpSecrets []models.BackupSecretKeyRing
	secretValueInKeyRing, err := GetValueInKeyring(INFISICAL_BACKUP_SECRET)
	if err != nil {
		if err == keyring.ErrUnsupportedPlatform {
			return errors.New("your OS does not support keyring. Consider using a service token https://infisical.com/docs/documentation/platform/token")
		} else if err != keyring.ErrNotFound {
			return fmt.Errorf("something went wrong, failed to retrieve value from system keyring [error=%v]", err)
		}
	}
	_ = json.Unmarshal([]byte(secretValueInKeyRing), &backedUpSecrets)

	backedUpSecrets = slices.DeleteFunc(backedUpSecrets, func(e models.BackupSecretKeyRing) bool {
		return e.SecretPath == secretsPath && e.ProjectID == workspace && e.Environment == environment
	})
	newBackupSecret := models.BackupSecretKeyRing{
		ProjectID:   workspace,
		Environment: environment,
		SecretPath:  secretsPath,
		Secrets:     secrets,
	}
	backedUpSecrets = append(backedUpSecrets, newBackupSecret)

	listOfSecretsMarshalled, err := json.Marshal(backedUpSecrets)
	if err != nil {
		return err
	}

	err = SetValueInKeyring(INFISICAL_BACKUP_SECRET, string(listOfSecretsMarshalled))
	if err != nil {
		return fmt.Errorf("StoreUserCredsInKeyRing: unable to store user credentials because [err=%s]", err)
	}

	return nil
}

func ReadBackupSecrets(workspace string, environment string, secretsPath string) ([]models.SingleEnvironmentVariable, error) {
	secretValueInKeyRing, err := GetValueInKeyring(INFISICAL_BACKUP_SECRET)
	if err != nil {
		if err == keyring.ErrUnsupportedPlatform {
			return nil, errors.New("your OS does not support keyring. Consider using a service token https://infisical.com/docs/documentation/platform/token")
		} else if err == keyring.ErrNotFound {
			return nil, errors.New("credentials not found in system keyring")
		} else {
			return nil, fmt.Errorf("something went wrong, failed to retrieve value from system keyring [error=%v]", err)
		}
	}

	var backedUpSecrets []models.BackupSecretKeyRing
	err = json.Unmarshal([]byte(secretValueInKeyRing), &backedUpSecrets)
	if err != nil {
		return nil, fmt.Errorf("getUserCredsFromKeyRing: Something went wrong when unmarshalling user creds [err=%s]", err)
	}

	for _, backupSecret := range backedUpSecrets {
		if backupSecret.Environment == environment && backupSecret.ProjectID == workspace && backupSecret.SecretPath == secretsPath {
			return backupSecret.Secrets, nil
		}
	}

	return nil, nil
}

func DeleteBackupSecrets() error {
	// keeping this logic for now. Need to remove it later as more users migrate keyring would be used and this folder will be removed completely by then
	secrets_backup_folder_name := "secrets-backup"

	_, fullConfigFileDirPath, err := GetFullConfigFilePath()
	if err != nil {
		return fmt.Errorf("ReadBackupSecrets: unable to write config file because an error occurred when getting config file path [err=%s]", err)
	}

	fullPathToSecretsBackupFolder := fmt.Sprintf("%s/%s", fullConfigFileDirPath, secrets_backup_folder_name)

	DeleteValueInKeyring(INFISICAL_BACKUP_SECRET)

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
	httpClient := resty.New()
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

func SetRawSecrets(secretArgs []string, secretType string, environmentName string, secretsPath string, projectId string, tokenDetails *models.TokenDetails) ([]models.SecretSetOperation, error) {

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

	httpClient := resty.New().
		SetAuthToken(tokenDetails.Token).
		SetHeader("Accept", "application/json")

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
