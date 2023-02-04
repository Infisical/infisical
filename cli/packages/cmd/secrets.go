/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"encoding/base64"
	"fmt"
	"strings"
	"unicode"

	"crypto/sha256"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/crypto"
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
			util.HandleError(err)
		}

		infisicalToken, err := cmd.Flags().GetString("token")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		shouldExpandSecrets, err := cmd.Flags().GetBool("expand")
		if err != nil {
			util.HandleError(err)
		}

		secrets, err := util.GetAllEnvironmentVariables(models.GetAllSecretsParameters{Environment: environmentName, InfisicalToken: infisicalToken})
		if err != nil {
			util.HandleError(err)
		}

		if shouldExpandSecrets {
			secrets = util.SubstituteSecrets(secrets)
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
		environmentName, err := cmd.Flags().GetString("env")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		if !util.IsSecretEnvironmentValid(environmentName) {
			util.PrintMessageAndExit("You have entered a invalid environment name", "Environment names can only be prod, dev, test or staging")
		}

		workspaceFile, err := util.GetWorkSpaceFromFile()
		if err != nil {
			util.HandleError(err, "Unable to get your local config details")
		}

		loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails()
		if err != nil {
			util.HandleError(err, "Unable to authenticate")
		}

		httpClient := resty.New().
			SetAuthToken(loggedInUserDetails.UserCredentials.JTWToken).
			SetHeader("Accept", "application/json")

		request := api.GetEncryptedWorkspaceKeyRequest{
			WorkspaceId: workspaceFile.WorkspaceId,
		}

		workspaceKeyResponse, err := api.CallGetEncryptedWorkspaceKey(httpClient, request)
		if err != nil {
			util.HandleError(err, "unable to get your encrypted workspace key")
		}

		encryptedWorkspaceKey, _ := base64.StdEncoding.DecodeString(workspaceKeyResponse.EncryptedKey)
		encryptedWorkspaceKeySenderPublicKey, _ := base64.StdEncoding.DecodeString(workspaceKeyResponse.Sender.PublicKey)
		encryptedWorkspaceKeyNonce, _ := base64.StdEncoding.DecodeString(workspaceKeyResponse.Nonce)
		currentUsersPrivateKey, _ := base64.StdEncoding.DecodeString(loggedInUserDetails.UserCredentials.PrivateKey)

		// decrypt workspace key
		plainTextEncryptionKey := crypto.DecryptAsymmetric(encryptedWorkspaceKey, encryptedWorkspaceKeyNonce, encryptedWorkspaceKeySenderPublicKey, currentUsersPrivateKey)

		// pull current secrets
		secrets, err := util.GetAllEnvironmentVariables(models.GetAllSecretsParameters{Environment: environmentName})
		if err != nil {
			util.HandleError(err, "unable to retrieve secrets")
		}

		type SecretSetOperation struct {
			SecretKey       string
			SecretValue     string
			SecretOperation string
		}

		secretsToCreate := []api.Secret{}
		secretsToModify := []api.Secret{}
		secretOperations := []SecretSetOperation{}

		secretByKey := getSecretsByKeys(secrets)

		for _, arg := range args {
			splitKeyValueFromArg := strings.SplitN(arg, "=", 2)
			if splitKeyValueFromArg[0] == "" || splitKeyValueFromArg[1] == "" {
				util.PrintMessageAndExit("ensure that each secret has a none empty key and value. Modify the input and try again")
			}

			if unicode.IsNumber(rune(splitKeyValueFromArg[0][0])) {
				util.PrintMessageAndExit("keys of secrets cannot start with a number. Modify the key name(s) and try again")
			}

			// Key and value from argument
			key := strings.ToUpper(splitKeyValueFromArg[0])
			value := splitKeyValueFromArg[1]

			hashedKey := fmt.Sprintf("%x", sha256.Sum256([]byte(key)))
			encryptedKey, err := crypto.EncryptSymmetric([]byte(key), []byte(plainTextEncryptionKey))
			if err != nil {
				util.HandleError(err, "unable to encrypt your secrets")
			}

			hashedValue := fmt.Sprintf("%x", sha256.Sum256([]byte(value)))
			encryptedValue, err := crypto.EncryptSymmetric([]byte(value), []byte(plainTextEncryptionKey))
			if err != nil {
				util.HandleError(err, "unable to encrypt your secrets")
			}

			if existingSecret, ok := secretByKey[key]; ok {
				// case: secret exists in project so it needs to be modified
				encryptedSecretDetails := api.Secret{
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
				encryptedSecretDetails := api.Secret{
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
			batchCreateRequest := api.BatchCreateSecretsByWorkspaceAndEnvRequest{
				WorkspaceId: workspaceFile.WorkspaceId,
				Environment: environmentName,
				Secrets:     secretsToCreate,
			}

			err = api.CallBatchCreateSecretsByWorkspaceAndEnv(httpClient, batchCreateRequest)
			if err != nil {
				util.HandleError(err, "Unable to process new secret creations")
				return
			}
		}

		if len(secretsToModify) > 0 {
			batchModifyRequest := api.BatchModifySecretsByWorkspaceAndEnvRequest{
				WorkspaceId: workspaceFile.WorkspaceId,
				Environment: environmentName,
				Secrets:     secretsToModify,
			}

			err = api.CallBatchModifySecretsByWorkspaceAndEnv(httpClient, batchModifyRequest)
			if err != nil {
				util.HandleError(err, "Unable to process the modifications to your secrets")
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
			util.HandleError(err, "Unable to authenticate")
		}

		workspaceFile, err := util.GetWorkSpaceFromFile()
		if err != nil {
			util.HandleError(err, "Unable to get local project details")
		}

		secrets, err := util.GetAllEnvironmentVariables(models.GetAllSecretsParameters{Environment: environmentName})
		if err != nil {
			util.HandleError(err, "Unable to fetch secrets")
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
			message := fmt.Sprintf("secret name(s) [%v] does not exist in your project. To see which secrets exist run [infisical secrets]", strings.Join(invalidSecretNamesThatDoNotExist, ", "))
			util.PrintMessageAndExit(message)
		}

		request := api.BatchDeleteSecretsBySecretIdsRequest{
			WorkspaceId:     workspaceFile.WorkspaceId,
			EnvironmentName: environmentName,
			SecretIds:       validSecretIdsToDelete,
		}

		httpClient := resty.New().
			SetAuthToken(loggedInUserDetails.UserCredentials.JTWToken).
			SetHeader("Accept", "application/json")

		err = api.CallBatchDeleteSecretsByWorkspaceAndEnv(httpClient, request)
		if err != nil {
			util.HandleError(err, "Unable to complete your batch delete request")
		}

		fmt.Printf("secret name(s) [%v] have been deleted from your project \n", strings.Join(args, ", "))

	},
}

func getSecretsByNames(cmd *cobra.Command, args []string) {
	environmentName, err := cmd.Flags().GetString("env")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	workspaceFileExists := util.WorkspaceConfigFileExistsInCurrentPath()
	if !workspaceFileExists {
		util.HandleError(err, "Unable to parse flag")
	}

	infisicalToken, err := cmd.Flags().GetString("token")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	secrets, err := util.GetAllEnvironmentVariables(models.GetAllSecretsParameters{Environment: environmentName, InfisicalToken: infisicalToken})
	if err != nil {
		util.HandleError(err, "To fetch all secrets")
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

func init() {
	secretsGetCmd.Flags().String("token", "", "Fetch secrets using the Infisical Token")
	secretsCmd.AddCommand(secretsGetCmd)

	secretsCmd.AddCommand(secretsSetCmd)
	secretsSetCmd.PersistentPreRun = func(cmd *cobra.Command, args []string) {
		util.RequireLogin()
		util.RequireLocalWorkspaceFile()
	}

	secretsCmd.AddCommand(secretsDeleteCmd)
	secretsDeleteCmd.PersistentPreRun = func(cmd *cobra.Command, args []string) {
		util.RequireLogin()
		util.RequireLocalWorkspaceFile()
	}

	secretsCmd.Flags().String("token", "", "Fetch secrets using the Infisical Token")
	secretsCmd.PersistentFlags().String("env", "dev", "Used to select the environment name on which actions should be taken on")
	secretsCmd.Flags().Bool("expand", true, "Parse shell parameter expansions in your secrets")
	rootCmd.AddCommand(secretsCmd)
}
