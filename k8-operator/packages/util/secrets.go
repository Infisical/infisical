package util

import (
	"encoding/base64"
	"fmt"
	"path"
	"regexp"
	"strings"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/api"
	"github.com/Infisical/infisical/k8-operator/packages/crypto"
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

func GetPlainTextSecretsViaMachineIdentity(infisicalClient infisical.InfisicalClientInterface, etag string, secretScope v1alpha1.MachineIdentityScopeInWorkspace) ([]model.SingleEnvironmentVariable, model.RequestUpdateUpdateDetails, error) {

	secrets, err := infisicalClient.Secrets().List(infisical.ListSecretsOptions{
		ProjectSlug:            secretScope.ProjectSlug,
		Environment:            secretScope.EnvSlug,
		Recursive:              secretScope.Recursive,
		SecretPath:             secretScope.SecretsPath,
		IncludeImports:         true,
		ExpandSecretReferences: true,
	})

	if err != nil {
		return nil, model.RequestUpdateUpdateDetails{}, err
	}

	var environmentVariables []model.SingleEnvironmentVariable

	for _, secret := range secrets {

		environmentVariables = append(environmentVariables, model.SingleEnvironmentVariable{
			Key:   secret.SecretKey,
			Value: secret.SecretValue,
			Type:  secret.Type,
			ID:    secret.ID,
		})
	}

	newEtag := crypto.ComputeEtag([]byte(fmt.Sprintf("%v", environmentVariables)))

	return environmentVariables, model.RequestUpdateUpdateDetails{
		Modified: etag != newEtag,
		ETag:     newEtag,
	}, nil
}

func GetPlainTextSecretsViaServiceToken(fullServiceToken string, etag string, envSlug string, secretPath string, recursive bool) ([]model.SingleEnvironmentVariable, model.RequestUpdateUpdateDetails, error) {
	serviceTokenParts := strings.SplitN(fullServiceToken, ".", 4)
	if len(serviceTokenParts) < 4 {
		return nil, model.RequestUpdateUpdateDetails{}, fmt.Errorf("invalid service token entered. Please double check your service token and try again")
	}

	serviceToken := fmt.Sprintf("%v.%v.%v", serviceTokenParts[0], serviceTokenParts[1], serviceTokenParts[2])

	httpClient := resty.New()

	httpClient.SetAuthToken(serviceToken).
		SetHeader("Accept", "application/json")

	serviceTokenDetails, err := api.CallGetServiceTokenDetailsV2(httpClient)
	if err != nil {
		return nil, model.RequestUpdateUpdateDetails{}, fmt.Errorf("unable to get service token details. [err=%v]", err)
	}

	encryptedSecretsResponse, err := api.CallGetSecretsV3(httpClient, api.GetEncryptedSecretsV3Request{
		WorkspaceId: serviceTokenDetails.Workspace,
		Environment: envSlug,
		Recursive:   recursive,
		ETag:        etag,
		SecretPath:  secretPath,
	})

	if err != nil {
		return nil, model.RequestUpdateUpdateDetails{}, err
	}

	decodedSymmetricEncryptionDetails, err := GetBase64DecodedSymmetricEncryptionDetails(serviceTokenParts[3], serviceTokenDetails.EncryptedKey, serviceTokenDetails.Iv, serviceTokenDetails.Tag)
	if err != nil {
		return nil, model.RequestUpdateUpdateDetails{}, fmt.Errorf("unable to decode symmetric encryption details [err=%v]", err)
	}

	plainTextWorkspaceKey, err := crypto.DecryptSymmetric([]byte(serviceTokenParts[3]), decodedSymmetricEncryptionDetails.Cipher, decodedSymmetricEncryptionDetails.Tag, decodedSymmetricEncryptionDetails.IV)
	if err != nil {
		return nil, model.RequestUpdateUpdateDetails{}, fmt.Errorf("unable to decrypt the required workspace key")
	}

	plainTextSecrets, err := GetPlainTextSecrets(plainTextWorkspaceKey, encryptedSecretsResponse.Secrets)
	if err != nil {
		return nil, model.RequestUpdateUpdateDetails{}, fmt.Errorf("unable to decrypt your secrets [err=%v]", err)
	}

	plainTextSecretsMergedWithImports, err := InjectImportedSecret(plainTextWorkspaceKey, plainTextSecrets, encryptedSecretsResponse.ImportedSecrets)
	if err != nil {
		return nil, model.RequestUpdateUpdateDetails{}, err
	}

	// expand secrets that are referenced
	expandedSecrets := ExpandSecrets(plainTextSecretsMergedWithImports, fullServiceToken)

	return expandedSecrets, model.RequestUpdateUpdateDetails{
		Modified: encryptedSecretsResponse.Modified,
		ETag:     encryptedSecretsResponse.ETag,
	}, nil
}

// Fetches plaintext secrets from an API endpoint using a service account.
// The function fetches the service account details and keys, decrypts the workspace key, fetches the encrypted secrets for the specified project and environment, and decrypts the secrets using the decrypted workspace key.
// Returns the plaintext secrets, encrypted secrets response, and any errors that occurred during the process.
func GetPlainTextSecretsViaServiceAccount(serviceAccountCreds model.ServiceAccountDetails, projectId string, environmentName string, etag string) ([]model.SingleEnvironmentVariable, model.RequestUpdateUpdateDetails, error) {
	httpClient := resty.New()
	httpClient.SetAuthToken(serviceAccountCreds.AccessKey).
		SetHeader("Accept", "application/json")

	serviceAccountDetails, err := api.CallGetServiceTokenAccountDetailsV2(httpClient)
	if err != nil {
		return nil, model.RequestUpdateUpdateDetails{}, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to get service account details. [err=%v]", err)
	}

	serviceAccountKeys, err := api.CallGetServiceAccountKeysV2(httpClient, api.GetServiceAccountKeysRequest{ServiceAccountId: serviceAccountDetails.ServiceAccount.ID})
	if err != nil {
		return nil, model.RequestUpdateUpdateDetails{}, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to get service account key details. [err=%v]", err)
	}

	// find key for requested project
	var workspaceServiceAccountKey api.ServiceAccountKey
	for _, serviceAccountKey := range serviceAccountKeys.ServiceAccountKeys {
		if serviceAccountKey.Workspace == projectId {
			workspaceServiceAccountKey = serviceAccountKey
		}
	}

	if workspaceServiceAccountKey.ID == "" || workspaceServiceAccountKey.EncryptedKey == "" || workspaceServiceAccountKey.Nonce == "" || serviceAccountCreds.PublicKey == "" || serviceAccountCreds.PrivateKey == "" {
		return nil, model.RequestUpdateUpdateDetails{}, fmt.Errorf("unable to find key for [projectId=%s] [err=%v]. Ensure that the given service account has access to given projectId", projectId, err)
	}

	cipherText, err := base64.StdEncoding.DecodeString(workspaceServiceAccountKey.EncryptedKey)
	if err != nil {
		return nil, model.RequestUpdateUpdateDetails{}, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to decode EncryptedKey secrets because [err=%v]", err)
	}

	nonce, err := base64.StdEncoding.DecodeString(workspaceServiceAccountKey.Nonce)
	if err != nil {
		return nil, model.RequestUpdateUpdateDetails{}, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to decode nonce secrets because [err=%v]", err)
	}

	publickey, err := base64.StdEncoding.DecodeString(serviceAccountCreds.PublicKey)
	if err != nil {
		return nil, model.RequestUpdateUpdateDetails{}, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to decode PublicKey secrets because [err=%v]", err)
	}

	privateKey, err := base64.StdEncoding.DecodeString(serviceAccountCreds.PrivateKey)

	if err != nil {
		return nil, model.RequestUpdateUpdateDetails{}, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to decode PrivateKey secrets because [err=%v]", err)
	}

	plainTextWorkspaceKey := crypto.DecryptAsymmetric(cipherText, nonce, publickey, privateKey)

	encryptedSecretsResponse, err := api.CallGetSecretsV3(httpClient, api.GetEncryptedSecretsV3Request{
		WorkspaceId: projectId,
		Environment: environmentName,
		ETag:        etag,
	})

	if err != nil {
		return nil, model.RequestUpdateUpdateDetails{}, fmt.Errorf("unable to fetch secrets because [err=%v]", err)
	}

	plainTextSecrets, err := GetPlainTextSecrets(plainTextWorkspaceKey, encryptedSecretsResponse.Secrets)
	if err != nil {
		return nil, model.RequestUpdateUpdateDetails{}, fmt.Errorf("GetPlainTextSecretsViaServiceAccount: unable to get plain text secrets because [err=%v]", err)
	}

	return plainTextSecrets, model.RequestUpdateUpdateDetails{
		Modified: encryptedSecretsResponse.Modified,
		ETag:     encryptedSecretsResponse.ETag,
	}, nil
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

func GetPlainTextSecrets(key []byte, encryptedSecrets []api.EncryptedSecretV3) ([]model.SingleEnvironmentVariable, error) {
	plainTextSecrets := []model.SingleEnvironmentVariable{}
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

var secRefRegex = regexp.MustCompile(`\${([^\}]*)}`)

func recursivelyExpandSecret(expandedSecs map[string]string, interpolatedSecs map[string]string, crossSecRefFetch func(env string, path []string, key string) string, key string) string {
	if v, ok := expandedSecs[key]; ok {
		return v
	}

	interpolatedVal, ok := interpolatedSecs[key]
	if !ok {
		return ""
		// panic(fmt.Errorf("Could not find referred secret with key name  %s", key), "Please check it refers a")
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

func ExpandSecrets(secrets []model.SingleEnvironmentVariable, infisicalToken string) []model.SingleEnvironmentVariable {
	expandedSecs := make(map[string]string)
	interpolatedSecs := make(map[string]string)
	// map[env.secret-path][keyname]Secret
	crossEnvRefSecs := make(map[string]map[string]model.SingleEnvironmentVariable) // a cache to hold all cross board reference secrets

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
				// if not in cross reference cache, fetch it from server
				refSecs, _, err := GetPlainTextSecretsViaServiceToken(infisicalToken, "", env, secPath, false)
				if err != nil {
					fmt.Printf("Could not fetch secrets in environment: %s secret-path: %s", env, secPath)
					// HandleError(err, fmt.Sprintf("Could not fetch secrets in environment: %s secret-path: %s", env, secPath), "If you are using a service token to fetch secrets, please ensure it is valid")
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

func getSecretsByKeys(secrets []model.SingleEnvironmentVariable) map[string]model.SingleEnvironmentVariable {
	secretMapByName := make(map[string]model.SingleEnvironmentVariable, len(secrets))

	for _, secret := range secrets {
		secretMapByName[secret.Key] = secret
	}

	return secretMapByName
}

func InjectImportedSecret(plainTextWorkspaceKey []byte, secrets []model.SingleEnvironmentVariable, importedSecrets []api.ImportedSecretV3) ([]model.SingleEnvironmentVariable, error) {
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

func MergeRawImportedSecrets(secrets []model.SingleEnvironmentVariable, importedSecrets []api.ImportedRawSecretV3) []model.SingleEnvironmentVariable {
	if importedSecrets == nil {
		return secrets
	}

	hasOverriden := make(map[string]bool)
	for _, sec := range secrets {
		hasOverriden[sec.Key] = true
	}

	for i := len(importedSecrets) - 1; i >= 0; i-- {
		importSec := importedSecrets[i]

		for _, sec := range importSec.Secrets {
			if _, ok := hasOverriden[sec.SecretKey]; !ok {
				secrets = append(secrets, model.SingleEnvironmentVariable{
					Key:   sec.SecretKey,
					Value: sec.SecretValue,
					Type:  sec.Type,
					ID:    sec.ID,
				})
				hasOverriden[sec.SecretKey] = true
			}
		}
	}

	return secrets
}
