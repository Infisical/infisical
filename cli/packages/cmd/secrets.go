/*
Copyright © 2022 NAME HERE <EMAIL ADDRESS>
*/
package cmd

import (
	"encoding/base64"
	"fmt"
	"strings"

	"crypto/sha256"

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
		secrets, err := util.GetAllEnvironmentVariables("", "dev")
		secrets = util.SubstituteSecrets(secrets)
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
	Example:               `secrets set <secret name A> <secret value A> <secret name B> <secret value B>..."`,
	Short:                 "Used update retrieve secrets by name",
	Use:                   "set [secrets]",
	DisableFlagsInUseLine: true,
	PreRun:                toggleDebug,
	Args:                  cobra.MinimumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
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
			WorkspaceId: "63b0c1dbf2a30bdfddcfe1ac",
		}

		workspaceKeyResponse, err := http.CallGetEncryptedWorkspaceKey(httpClient, request)
		if err != nil {
			log.Errorf("unable to get your encrypted workspace key. [err=%v]", err)
			return
		}

		encryptedWorkspaceKey, _ := base64.StdEncoding.DecodeString(workspaceKeyResponse.LatestKey.EncryptedKey)
		encryptedWorkspaceKeySenderPublicKey, _ := base64.StdEncoding.DecodeString(workspaceKeyResponse.LatestKey.Sender.PublicKey)
		encryptedWorkspaceKeyNonce, _ := base64.StdEncoding.DecodeString(workspaceKeyResponse.LatestKey.Nonce)
		currentUsersPrivateKey, _ := base64.StdEncoding.DecodeString(loggedInUserDetails.UserCredentials.PrivateKey)

		// decrypt workspace key
		plainTextEncryptionKey := util.DecryptAsymmetric(encryptedWorkspaceKey, encryptedWorkspaceKeyNonce, encryptedWorkspaceKeySenderPublicKey, currentUsersPrivateKey)

		// pull current secrets
		secrets, err := util.GetAllEnvironmentVariables("", "dev")
		if err != nil {
			log.Error("Unable to retrieve secrets. Run with -d to see full logs")
			log.Debug(err)
		}

		secretsToCreate := []models.Secret{}
		secretsToModify := []models.Secret{}

		secretByKey := getSecretsByKeys(secrets)

		for _, arg := range args {
			splitKeyValueFromArg := strings.SplitN(arg, "=", 2)
			if len(splitKeyValueFromArg) < 2 {
				splitKeyValueFromArg[1] = ""
			}

			key := splitKeyValueFromArg[0]
			value := splitKeyValueFromArg[1]

			fmt.Println("key", key, "value", value)

			hashedKey := fmt.Sprintf("%x", sha256.Sum256([]byte(key)))
			encryptedKey, err := util.EncryptSymmetric([]byte(key), []byte(plainTextEncryptionKey))
			if err != nil {
				log.Errorf("unable to encrypt your secrets [err=%v]", err)
			}

			hashedValue := fmt.Sprintf("%x", sha256.Sum256([]byte(value)))
			encryptedValue, err := util.EncryptSymmetric([]byte(value), []byte(plainTextEncryptionKey))
			if err != nil {
				log.Errorf("unable to encrypt your secrets [err=%v]", err)
			}

			if value, ok := secretByKey[key]; ok {
				// case: secret exists in project so it needs to be modified
				encryptedSecretDetails := models.Secret{
					ID:                    value.ID,
					SecretValueCiphertext: base64.StdEncoding.EncodeToString(encryptedValue.CipherText),
					SecretValueIV:         base64.StdEncoding.EncodeToString(encryptedValue.Nonce),
					SecretValueTag:        base64.StdEncoding.EncodeToString(encryptedValue.AuthTag),
					SecretValueHash:       hashedValue,
				}
				secretsToModify = append(secretsToModify, encryptedSecretDetails)
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
					Type:                  "shared",
				}
				secretsToCreate = append(secretsToCreate, encryptedSecretDetails)
			}
		}

		if len(secretsToCreate) > 0 {
			fmt.Println("create")
			batchCreateRequest := models.BatchCreateSecretsByWorkspaceAndEnvRequest{
				WorkspaceId:     "63b0c1dbf2a30bdfddcfe1ac",
				EnvironmentName: "dev",
				Secrets:         secretsToCreate,
			}

			err = http.CallBatchCreateSecretsByWorkspaceAndEnv(httpClient, batchCreateRequest)
			if err != nil {
				log.Errorf("Unable to process new secret creations because %v", err)
				return
			}
		}

		if len(secretsToModify) > 0 {
			fmt.Println("modify")
			batchModifyRequest := models.BatchModifySecretsByWorkspaceAndEnvRequest{
				WorkspaceId:     "63b0c1dbf2a30bdfddcfe1ac",
				EnvironmentName: "dev",
				Secrets:         secretsToModify,
			}

			err = http.CallBatchModifySecretsByWorkspaceAndEnv(httpClient, batchModifyRequest)
			if err != nil {
				log.Errorf("Unable to process the modifications to your secrets because %v", err)
				return
			}
		}

		log.Infof("secret name(s) [%v] have been set", strings.Join(args, ", "))
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

		secrets, err := util.GetAllEnvironmentVariables("", "dev")
		if err != nil {
			log.Error("Unable to retrieve secrets. Run with -d to see full logs")
			log.Debug(err)
		}

		secretByKey := getSecretsByKeys(secrets)
		validSecretIdsToDelete := []string{}
		invalidSecretNamesThatDoNotExist := []string{}

		for _, secretKeyFromArg := range args {
			if value, ok := secretByKey[secretKeyFromArg]; ok {
				validSecretIdsToDelete = append(validSecretIdsToDelete, value.ID)
			} else {
				invalidSecretNamesThatDoNotExist = append(invalidSecretNamesThatDoNotExist, secretKeyFromArg)
			}
		}

		if len(invalidSecretNamesThatDoNotExist) != 0 {
			log.Errorf("secret name(s) [%v] does not exist in your project. Please remove and re-run the command", strings.Join(invalidSecretNamesThatDoNotExist, ", "))
			return
		}

		request := models.BatchDeleteSecretsBySecretIdsRequest{
			WorkspaceId:     "63b0c1dbf2a30bdfddcfe1ac",
			EnvironmentName: "dev",
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
	secretsCmd.AddCommand(secretsSetCmd)
	secretsCmd.AddCommand(secretsDeleteCmd)
	rootCmd.AddCommand(secretsCmd)
}

func getSecretsByNames(cmd *cobra.Command, args []string) {
	secrets, err := util.GetAllEnvironmentVariables("", "dev")
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
		if value, ok := secretsMap[secretKeyFromArg]; ok {
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
