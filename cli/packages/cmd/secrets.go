/*
Copyright © 2022 NAME HERE <EMAIL ADDRESS>
*/
package cmd

import (
	"encoding/base64"
	"fmt"
	"strings"
	"unicode"

	"crypto/sha256"

	"github.com/Infisical/infisical-merge/packages/crypto"
	"github.com/Infisical/infisical-merge/packages/http"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/Infisical/infisical-merge/packages/visualize"
	"github.com/go-resty/resty/v2"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var secretsCmd = &cobra.Command{
	Example:               `infisical secrets"`,
	Short:                 "Used to create, read update and delete secrets",
	Use:                   "secrets",
	DisableFlagsInUseLine: true,
	PreRun:                toggleDebug,
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		environmentName, err := cmd.Flags().GetString("env")
		if err != nil {
			log.Errorln("Unable to parse the environment name flag")
			log.Debugln(err)
			return
		}

		shouldExpandSecrets, err := cmd.Flags().GetBool("expand")
		if err != nil {
			log.Errorln("Unable to parse the substitute flag")
			log.Debugln(err)
			return
		}

		workspaceFileExists := util.WorkspaceConfigFileExistsInCurrentPath()
		if !workspaceFileExists {
			log.Error("You have not yet connected to an Infisical Project. Please run [infisical init]")
			return
		}

		secrets, err := util.GetAllEnvironmentVariables("", environmentName)

		if shouldExpandSecrets {
			secrets = util.SubstituteSecrets(secrets)
		}

		if err != nil {
			log.Debugln(err)
			return
		}

		visualize.PrintAllSecretDetails(secrets)
	},
}

var secretsGetCmd = &cobra.Command{
	Example:               `secrets get <secret name A> <secret name B>..."`,
	Short:                 "Used to retrieve secrets by name",
	Use:                   "get [secrets]",
	DisableFlagsInUseLine: true,
	Args:                  cobra.MinimumNArgs(1),
	PreRun:                toggleDebug,
	Run:                   getSecretsByNames,
}

var secretsSetCmd = &cobra.Command{
	Example:               `secrets set <secretName=secretValue> <secretName=secretValue>..."`,
	Short:                 "Used set secrets",
	Use:                   "set [secrets]",
	DisableFlagsInUseLine: true,
	PreRun:                toggleDebug,
	Args:                  cobra.MinimumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		// secretType, err := cmd.Flags().GetString("type")
		// if err != nil {
		// 	log.Errorln("Unable to parse the secret type flag")
		// 	log.Debugln(err)
		// 	return
		// }

		// if !util.IsSecretTypeValid(secretType) {
		// 	log.Errorf("secret type can only be `personal` or `shared`. You have entered [%v]", secretType)
		// 	return
		// }

		environmentName, err := cmd.Flags().GetString("env")
		if err != nil {
			log.Errorln("Unable to parse the environment name flag")
			log.Debugln(err)
			return
		}

		if !util.IsSecretEnvironmentValid(environmentName) {
			log.Errorln("You have entered a invalid environment name. Environment names can only be prod, dev, test or staging")
			return
		}

		workspaceFileExists := util.WorkspaceConfigFileExistsInCurrentPath()
		if !workspaceFileExists {
			log.Error("You have not yet connected to an Infisical Project. Please run [infisical init]")
			return
		}

		workspaceFile, err := util.GetWorkSpaceFromFile()
		if err != nil {
			log.Error(err)
			return
		}

		loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails()
		if err != nil {
			log.Error(err)
			return
		}

		if !loggedInUserDetails.IsUserLoggedIn {
			log.Error("You are not logged in yet. Please run [infisical login] then try again")
			return
		}

		if loggedInUserDetails.IsUserLoggedIn && loggedInUserDetails.LoginExpired {
			log.Error("Your login has expired. Please run [infisical login] then try again")
			return
		}

		httpClient := resty.New().
			SetAuthToken(loggedInUserDetails.UserCredentials.JTWToken).
			SetHeader("Accept", "application/json")

		request := models.GetEncryptedWorkspaceKeyRequest{
			WorkspaceId: workspaceFile.WorkspaceId,
		}

		workspaceKeyResponse, err := http.CallGetEncryptedWorkspaceKey(httpClient, request)
		if err != nil {
			log.Errorf("unable to get your encrypted workspace key. [err=%v]", err)
			return
		}

		encryptedWorkspaceKey, _ := base64.StdEncoding.DecodeString(workspaceKeyResponse.EncryptedKey)
		encryptedWorkspaceKeySenderPublicKey, _ := base64.StdEncoding.DecodeString(workspaceKeyResponse.Sender.PublicKey)
		encryptedWorkspaceKeyNonce, _ := base64.StdEncoding.DecodeString(workspaceKeyResponse.Nonce)
		currentUsersPrivateKey, _ := base64.StdEncoding.DecodeString(loggedInUserDetails.UserCredentials.PrivateKey)

		// decrypt workspace key
		plainTextEncryptionKey := crypto.DecryptAsymmetric(encryptedWorkspaceKey, encryptedWorkspaceKeyNonce, encryptedWorkspaceKeySenderPublicKey, currentUsersPrivateKey)

		// pull current secrets
		secrets, err := util.GetAllEnvironmentVariables("", environmentName)
		if err != nil {
			log.Error("unable to retrieve secrets. Run with -d to see full logs")
			log.Debug(err)
		}

		type SecretSetOperation struct {
			SecretKey       string
			SecretValue     string
			SecretOperation string
		}

		secretsToCreate := []models.Secret{}
		secretsToModify := []models.Secret{}
		secretOperations := []SecretSetOperation{}

		secretByKey := getSecretsByKeys(secrets)

		for _, arg := range args {
			splitKeyValueFromArg := strings.SplitN(arg, "=", 2)
			if splitKeyValueFromArg[0] == "" || splitKeyValueFromArg[1] == "" {
				log.Error("ensure that each secret has a none empty key and value. Modify the input and try again")
				return
			}

			if unicode.IsNumber(rune(splitKeyValueFromArg[0][0])) {
				log.Error("keys of secrets cannot start with a number. Modify the key name(s) and try again")
				return
			}

			// Key and value from argument
			key := strings.ToUpper(splitKeyValueFromArg[0])
			value := splitKeyValueFromArg[1]

			hashedKey := fmt.Sprintf("%x", sha256.Sum256([]byte(key)))
			encryptedKey, err := crypto.EncryptSymmetric([]byte(key), []byte(plainTextEncryptionKey))
			if err != nil {
				log.Errorf("unable to encrypt your secrets [err=%v]", err)
			}

			hashedValue := fmt.Sprintf("%x", sha256.Sum256([]byte(value)))
			encryptedValue, err := crypto.EncryptSymmetric([]byte(value), []byte(plainTextEncryptionKey))
			if err != nil {
				log.Errorf("unable to encrypt your secrets [err=%v]", err)
			}

			if existingSecret, ok := secretByKey[key]; ok {
				// case: secret exists in project so it needs to be modified
				encryptedSecretDetails := models.Secret{
					ID:                    existingSecret.ID,
					SecretValueCiphertext: base64.StdEncoding.EncodeToString(encryptedValue.CipherText),
					SecretValueIV:         base64.StdEncoding.EncodeToString(encryptedValue.Nonce),
					SecretValueTag:        base64.StdEncoding.EncodeToString(encryptedValue.AuthTag),
					SecretValueHash:       hashedValue,
				}

				// Only add to modifications if the value is different
				if existingSecret.Value != value {
					secretsToModify = append(secretsToModify, encryptedSecretDetails)
					secretOperations = append(secretOperations, SecretSetOperation{
						SecretKey:       key,
						SecretValue:     value,
						SecretOperation: "SECRET VALUE MODIFIED",
					})
				} else {
					// Current value is same as exisitng so no change
					secretOperations = append(secretOperations, SecretSetOperation{
						SecretKey:       key,
						SecretValue:     value,
						SecretOperation: "SECRET VALUE UNCHANGED",
					})
				}

			} else {
				// case: secret doesn't exist in project so it needs to be created
				encryptedSecretDetails := models.Secret{
					SecretKeyCiphertext:   base64.StdEncoding.EncodeToString(encryptedKey.CipherText),
					SecretKeyIV:           base64.StdEncoding.EncodeToString(encryptedKey.Nonce),
					SecretKeyTag:          base64.StdEncoding.EncodeToString(encryptedKey.AuthTag),
					SecretKeyHash:         hashedKey,
					SecretValueCiphertext: base64.StdEncoding.EncodeToString(encryptedValue.CipherText),
					SecretValueIV:         base64.StdEncoding.EncodeToString(encryptedValue.Nonce),
					SecretValueTag:        base64.StdEncoding.EncodeToString(encryptedValue.AuthTag),
					SecretValueHash:       hashedValue,
					Type:                  util.SECRET_TYPE_SHARED,
				}
				secretsToCreate = append(secretsToCreate, encryptedSecretDetails)
				secretOperations = append(secretOperations, SecretSetOperation{
					SecretKey:       key,
					SecretValue:     value,
					SecretOperation: "SECRET CREATED",
				})
			}
		}

		if len(secretsToCreate) > 0 {
			batchCreateRequest := models.BatchCreateSecretsByWorkspaceAndEnvRequest{
				WorkspaceId:     workspaceFile.WorkspaceId,
				EnvironmentName: environmentName,
				Secrets:         secretsToCreate,
			}

			err = http.CallBatchCreateSecretsByWorkspaceAndEnv(httpClient, batchCreateRequest)
			if err != nil {
				log.Errorf("Unable to process new secret creations because %v", err)
				return
			}
		}

		if len(secretsToModify) > 0 {
			batchModifyRequest := models.BatchModifySecretsByWorkspaceAndEnvRequest{
				WorkspaceId:     workspaceFile.WorkspaceId,
				EnvironmentName: environmentName,
				Secrets:         secretsToModify,
			}

			err = http.CallBatchModifySecretsByWorkspaceAndEnv(httpClient, batchModifyRequest)
			if err != nil {
				log.Errorf("Unable to process the modifications to your secrets because %v", err)
				return
			}
		}

		// Print secret operations
		headers := []string{"SECRET NAME", "SECRET VALUE", "STATUS"}
		rows := [][]string{}
		for _, secretOperation := range secretOperations {
			rows = append(rows, []string{secretOperation.SecretKey, secretOperation.SecretValue, secretOperation.SecretOperation})
		}

		visualize.Table(headers, rows)
	},
}

var secretsDeleteCmd = &cobra.Command{
	Example:               `secrets delete <secret name A> <secret name B>..."`,
	Short:                 "Used to delete secrets by name",
	Use:                   "delete [secrets]",
	DisableFlagsInUseLine: true,
	PreRun:                toggleDebug,
	Args:                  cobra.MinimumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		environmentName, err := cmd.Flags().GetString("env")
		if err != nil {
			log.Errorln("Unable to parse the environment name flag")
			log.Debugln(err)
			return
		}

		loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails()
		if err != nil {
			log.Error(err)
			return
		}

		if !loggedInUserDetails.IsUserLoggedIn {
			log.Error("You are not logged in yet. Please run [infisical login] then try again")
			return
		}

		if loggedInUserDetails.IsUserLoggedIn && loggedInUserDetails.LoginExpired {
			log.Error("Your login has expired. Please run [infisical login] then try again")
			return
		}

		workspaceFileExists := util.WorkspaceConfigFileExistsInCurrentPath()
		if !workspaceFileExists {
			log.Error("You have not yet connected to an Infisical Project. Please run [infisical init]")
			return
		}

		workspaceFile, err := util.GetWorkSpaceFromFile()
		if err != nil {
			log.Error(err)
			return
		}

		secrets, err := util.GetAllEnvironmentVariables("", environmentName)
		if err != nil {
			log.Error("Unable to retrieve secrets. Run with -d to see full logs")
			log.Debug(err)
		}

		secretByKey := getSecretsByKeys(secrets)
		validSecretIdsToDelete := []string{}
		invalidSecretNamesThatDoNotExist := []string{}

		for _, secretKeyFromArg := range args {
			if value, ok := secretByKey[strings.ToUpper(secretKeyFromArg)]; ok {
				validSecretIdsToDelete = append(validSecretIdsToDelete, value.ID)
			} else {
				invalidSecretNamesThatDoNotExist = append(invalidSecretNamesThatDoNotExist, secretKeyFromArg)
			}
		}

		if len(invalidSecretNamesThatDoNotExist) != 0 {
			log.Errorf("secret name(s) [%v] does not exist in your project. To see which secrets exist run [infisical secrets]", strings.Join(invalidSecretNamesThatDoNotExist, ", "))
			return
		}

		request := models.BatchDeleteSecretsBySecretIdsRequest{
			WorkspaceId:     workspaceFile.WorkspaceId,
			EnvironmentName: environmentName,
			SecretIds:       validSecretIdsToDelete,
		}

		httpClient := resty.New().
			SetAuthToken(loggedInUserDetails.UserCredentials.JTWToken).
			SetHeader("Accept", "application/json")

		err = http.CallBatchDeleteSecretsByWorkspaceAndEnv(httpClient, request)
		if err != nil {
			log.Errorf("Unable to complete your request because %v", err)
			return
		}

		log.Infof("secret name(s) [%v] have been deleted from your project", strings.Join(args, ", "))

	},
}

func init() {
	secretsCmd.AddCommand(secretsGetCmd)
	// secretsSetCmd.Flags().String("type", "shared", "Used to set the type for secrets")
	secretsCmd.AddCommand(secretsSetCmd)
	secretsCmd.AddCommand(secretsDeleteCmd)
	secretsCmd.PersistentFlags().String("env", "dev", "Used to define the environment name on which actions should be taken on")
	secretsCmd.Flags().Bool("expand", true, "Parse shell parameter expansions in your secrets")
	rootCmd.AddCommand(secretsCmd)
}

func getSecretsByNames(cmd *cobra.Command, args []string) {
	environmentName, err := cmd.Flags().GetString("env")
	if err != nil {
		log.Errorln("Unable to parse the environment name flag")
		log.Debugln(err)
		return
	}

	workspaceFileExists := util.WorkspaceConfigFileExistsInCurrentPath()
	if !workspaceFileExists {
		log.Error("You have not yet connected to an Infisical Project. Please run [infisical init]")
		return
	}

	secrets, err := util.GetAllEnvironmentVariables("", environmentName)
	if err != nil {
		log.Error("Unable to retrieve secrets. Run with -d to see full logs")
		log.Debug(err)
	}

	requestedSecrets := []models.SingleEnvironmentVariable{}

	secretsMap := make(map[string]models.SingleEnvironmentVariable)
	for _, secret := range secrets {
		secretsMap[secret.Key] = secret
	}

	for _, secretKeyFromArg := range args {
		if value, ok := secretsMap[strings.ToUpper(secretKeyFromArg)]; ok {
			requestedSecrets = append(requestedSecrets, value)
		} else {
			requestedSecrets = append(requestedSecrets, models.SingleEnvironmentVariable{
				Key:   secretKeyFromArg,
				Type:  "*not found*",
				Value: "*not found*",
			})
		}
	}

	visualize.PrintAllSecretDetails(requestedSecrets)
}

func getSecretsByKeys(secrets []models.SingleEnvironmentVariable) map[string]models.SingleEnvironmentVariable {
	secretMapByName := make(map[string]models.SingleEnvironmentVariable)

	for _, secret := range secrets {
		secretMapByName[secret.Key] = secret
	}

	return secretMapByName
}
