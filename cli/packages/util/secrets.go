package util

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"regexp"
	"strings"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/crypto"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/go-resty/resty/v2"
	"github.com/rs/zerolog/log"
)

func GetPlainTextSecretsViaServiceToken(fullServiceToken string, environment string, secretPath string, includeImports bool, recursive bool) ([]models.SingleEnvironmentVariable, api.GetServiceTokenDetailsResponse, error) {
	serviceTokenParts := strings.SplitN(fullServiceToken, ".", 4)
	if len(serviceTokenParts) < 4 {
		return nil, api.GetServiceTokenDetailsResponse{}, fmt.Errorf("invalid service token entered. Please double check your service token and try again")
	}

	serviceToken := fmt.Sprintf("%v.%v.%v", serviceTokenParts[0], serviceTokenParts[1], serviceTokenParts[2])

	httpClient := resty.New()

	httpClient.SetAuthToken(serviceToken).
		SetHeader("Accept", "application/json")

	serviceTokenDetails, err := api.CallGetServiceTokenDetailsV2(httpClient)
	if err != nil {
		return nil, api.GetServiceTokenDetailsResponse{}, fmt.Errorf("unable to get service token details. [err=%v]", err)
	}

	// if multiple scopes are there then user needs to specify which environment and secret path
	if environment == "" {
		if len(serviceTokenDetails.Scopes) != 1 {
			return nil, api.GetServiceTokenDetailsResponse{}, fmt.Errorf("you need to provide the --env for multiple environment scoped token")
		} else {
			environment = serviceTokenDetails.Scopes[0].Environment
		}
	}

	encryptedSecrets, err := api.CallGetSecretsV3(httpClient, api.GetEncryptedSecretsV3Request{
		WorkspaceId:   serviceTokenDetails.Workspace,
		Environment:   environment,
		SecretPath:    secretPath,
		IncludeImport: includeImports,
		Recursive:     recursive,
	})

	if err != nil {
		return nil, api.GetServiceTokenDetailsResponse{}, err
	}

	decodedSymmetricEncryptionDetails, err := GetBase64DecodedSymmetricEncryptionDetails(serviceTokenParts[3], serviceTokenDetails.EncryptedKey, serviceTokenDetails.Iv, serviceTokenDetails.Tag)
	if err != nil {
		return nil, api.GetServiceTokenDetailsResponse{}, fmt.Errorf("unable to decode symmetric encryption details [err=%v]", err)
	}

	plainTextWorkspaceKey, err := crypto.DecryptSymmetric([]byte(serviceTokenParts[3]), decodedSymmetricEncryptionDetails.Cipher, decodedSymmetricEncryptionDetails.Tag, decodedSymmetricEncryptionDetails.IV)
	if err != nil {
		return nil, api.GetServiceTokenDetailsResponse{}, fmt.Errorf("unable to decrypt the required workspace key")
	}

	plainTextSecrets, err := GetPlainTextSecrets(plainTextWorkspaceKey, encryptedSecrets.Secrets)
	if err != nil {
		return nil, api.GetServiceTokenDetailsResponse{}, fmt.Errorf("unable to decrypt your secrets [err=%v]", err)
	}

	if includeImports {
		plainTextSecrets, err = InjectImportedSecret(plainTextWorkspaceKey, plainTextSecrets, encryptedSecrets.ImportedSecrets)
		if err != nil {
			return nil, api.GetServiceTokenDetailsResponse{}, err
		}
	}

	return plainTextSecrets, serviceTokenDetails, nil
}

func GetPlainTextSecretsViaJTW(JTWToken string, receiversPrivateKey string, workspaceId string, environmentName string, tagSlugs string, secretsPath string, includeImports bool, recursive bool) ([]models.SingleEnvironmentVariable, error) {
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
		log.Debug().Msgf("Missing credentials for generating plainTextEncryptionKey: [currentUsersPrivateKey=%s] [encryptedWorkspaceKeySenderPublicKey=%s]", currentUsersPrivateKey, encryptedWorkspaceKeySenderPublicKey)
		PrintErrorMessageAndExit("Some required user credentials are missing to generate your [plainTextEncryptionKey]. Please run [infisical login] then try again")
	}

	plainTextWorkspaceKey := crypto.DecryptAsymmetric(encryptedWorkspaceKey, encryptedWorkspaceKeyNonce, encryptedWorkspaceKeySenderPublicKey, currentUsersPrivateKey)

	getSecretsRequest := api.GetEncryptedSecretsV3Request{
		WorkspaceId:   workspaceId,
		Environment:   environmentName,
		IncludeImport: includeImports,
		Recursive:     recursive,
		// TagSlugs:    tagSlugs,
	}

	if secretsPath != "" {
		getSecretsRequest.SecretPath = secretsPath
	}

	encryptedSecrets, err := api.CallGetSecretsV3(httpClient, getSecretsRequest)
	if err != nil {
		return nil, err
	}

	plainTextSecrets, err := GetPlainTextSecrets(plainTextWorkspaceKey, encryptedSecrets.Secrets)
	if err != nil {
		return nil, fmt.Errorf("unable to decrypt your secrets [err=%v]", err)
	}

	if includeImports {
		plainTextSecrets, err = InjectImportedSecret(plainTextWorkspaceKey, plainTextSecrets, encryptedSecrets.ImportedSecrets)
		if err != nil {
			return nil, err
		}
	}

	return plainTextSecrets, nil
}

func GetPlainTextSecretsViaMachineIdentity(accessToken string, workspaceId string, environmentName string, secretsPath string, includeImports bool, recursive bool) (models.PlaintextSecretResult, error) {
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
	if err != nil {
		return models.PlaintextSecretResult{}, fmt.Errorf("unable to decrypt your secrets [err=%v]", err)
	}

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

func InjectImportedSecret(plainTextWorkspaceKey []byte, secrets []models.SingleEnvironmentVariable, importedSecrets []api.ImportedSecretV3) ([]models.SingleEnvironmentVariable, error) {
	if importedSecrets == nil {
		return secrets, nil
	}

	hasOverriden := make(map[string]bool)
	for _, sec := range secrets {
		hasOverriden[sec.Key] = true
	}

	for i := len(importedSecrets) - 1; i >= 0; i-- {
		importSec := importedSecrets[i]
		plainTextImportedSecrets, err := GetPlainTextSecrets(plainTextWorkspaceKey, importSec.Secrets)

		if err != nil {
			return nil, fmt.Errorf("unable to decrypt your imported secrets [err=%v]", err)
		}

		for _, sec := range plainTextImportedSecrets {
			if _, ok := hasOverriden[sec.Key]; !ok {
				secrets = append(secrets, sec)
				hasOverriden[sec.Key] = true
			}
		}
	}
	return secrets, nil
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
	isConnected := CheckIsConnectedToInternet()
	var secretsToReturn []models.SingleEnvironmentVariable
	// var serviceTokenDetails api.GetServiceTokenDetailsResponse
	var errorToReturn error

	if params.InfisicalToken == "" && params.UniversalAuthAccessToken == "" {
		if isConnected {
			log.Debug().Msg("GetAllEnvironmentVariables: Connected to internet, checking logged in creds")

			if projectConfigFilePath == "" {
				RequireLocalWorkspaceFile()
			} else {
				ValidateWorkspaceFile(projectConfigFilePath)
			}

			RequireLogin()
		}

		log.Debug().Msg("GetAllEnvironmentVariables: Trying to fetch secrets using logged in details")

		loggedInUserDetails, err := GetCurrentLoggedInUserDetails()
		if err != nil {
			return nil, err
		}

		if loggedInUserDetails.LoginExpired {
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

		secretsToReturn, errorToReturn = GetPlainTextSecretsViaJTW(loggedInUserDetails.UserCredentials.JTWToken, loggedInUserDetails.UserCredentials.PrivateKey, infisicalDotJson.WorkspaceId,
			params.Environment, params.TagSlugs, params.SecretsPath, params.IncludeImport, params.Recursive)
		log.Debug().Msgf("GetAllEnvironmentVariables: Trying to fetch secrets JTW token [err=%s]", errorToReturn)

		backupSecretsEncryptionKey := []byte(loggedInUserDetails.UserCredentials.PrivateKey)[0:32]
		if errorToReturn == nil {
			WriteBackupSecrets(infisicalDotJson.WorkspaceId, params.Environment, backupSecretsEncryptionKey, secretsToReturn)
		}

		// only attempt to serve cached secrets if no internet connection and if at least one secret cached
		if !isConnected {
			backedSecrets, err := ReadBackupSecrets(infisicalDotJson.WorkspaceId, params.Environment, backupSecretsEncryptionKey)
			if len(backedSecrets) > 0 {
				PrintWarning("Unable to fetch latest secret(s) due to connection error, serving secrets from last successful fetch. For more info, run with --debug")
				secretsToReturn = backedSecrets
				errorToReturn = err
			}
		}

	} else {
		if params.InfisicalToken != "" {
			log.Debug().Msg("Trying to fetch secrets using service token")
			secretsToReturn, _, errorToReturn = GetPlainTextSecretsViaServiceToken(params.InfisicalToken, params.Environment, params.SecretsPath, params.IncludeImport, params.Recursive)
		} else if params.UniversalAuthAccessToken != "" {

			if params.WorkspaceId == "" {
				PrintErrorMessageAndExit("Project ID is required when using machine identity")
			}

			log.Debug().Msg("Trying to fetch secrets using universal auth")
			res, err := GetPlainTextSecretsViaMachineIdentity(params.UniversalAuthAccessToken, params.WorkspaceId, params.Environment, params.SecretsPath, params.IncludeImport, params.Recursive)

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

func GetPlainTextSecrets(key []byte, encryptedSecrets []api.EncryptedSecretV3) ([]models.SingleEnvironmentVariable, error) {
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

func ParseSecretsFromDotEnvFile(filePath string) ([]string, error) {
	cwd,err:=os.Getwd()
	if err != nil {
		return nil, err
	}
	filePath = path.Join(cwd, filePath)
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	
	defer file.Close()
	env:=make([]string,0)
	
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		env = append(env, scanner.Text())
	}
	return env, nil
}
