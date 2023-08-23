/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"encoding/base64"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"crypto/sha256"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/crypto"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/Infisical/infisical-merge/packages/visualize"
	"github.com/go-resty/resty/v2"
	"github.com/posthog/posthog-go"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
)

var secretsCmd = &cobra.Command{
	Example:               `infisical secrets`,
	Short:                 "Used to create, read update and delete secrets",
	Use:                   "secrets",
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		environmentName, _ := cmd.Flags().GetString("env")
		if !cmd.Flags().Changed("env") {
			environmentFromWorkspace := util.GetEnvFromWorkspaceFile()
			if environmentFromWorkspace != "" {
				environmentName = environmentFromWorkspace
			}
		}

		infisicalToken, err := cmd.Flags().GetString("token")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		secretsPath, err := cmd.Flags().GetString("path")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		shouldExpandSecrets, err := cmd.Flags().GetBool("expand")
		if err != nil {
			util.HandleError(err)
		}

		includeImports, err := cmd.Flags().GetBool("include-imports")
		if err != nil {
			util.HandleError(err)
		}

		tagSlugs, err := cmd.Flags().GetString("tags")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		secretOverriding, err := cmd.Flags().GetBool("secret-overriding")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		secrets, err := util.GetAllEnvironmentVariables(models.GetAllSecretsParameters{Environment: environmentName, InfisicalToken: infisicalToken, TagSlugs: tagSlugs, SecretsPath: secretsPath, IncludeImport: includeImports})
		if err != nil {
			util.HandleError(err)
		}

		if secretOverriding {
			secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_PERSONAL)
		} else {
			secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_SHARED)
		}

		if shouldExpandSecrets {
			secrets = util.ExpandSecrets(secrets, infisicalToken)
		}

		visualize.PrintAllSecretDetails(secrets)
		Telemetry.CaptureEvent("cli-command:secrets", posthog.NewProperties().Set("secretCount", len(secrets)).Set("version", util.CLI_VERSION))
	},
}

var secretsGetCmd = &cobra.Command{
	Example:               `secrets get <secret name A> <secret name B>..."`,
	Short:                 "Used to retrieve secrets by name",
	Use:                   "get [secrets]",
	DisableFlagsInUseLine: true,
	Args:                  cobra.MinimumNArgs(1),
	Run:                   getSecretsByNames,
}

var secretsGenerateExampleEnvCmd = &cobra.Command{
	Example:               `secrets generate-example-env > .example-env`,
	Short:                 "Used to generate a example .env file",
	Use:                   "generate-example-env",
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
	Run:                   generateExampleEnv,
}

var secretsSetCmd = &cobra.Command{
	Example:               `secrets set <secretName=secretValue> <secretName=secretValue>..."`,
	Short:                 "Used set secrets",
	Use:                   "set [secrets]",
	DisableFlagsInUseLine: true,
	Args:                  cobra.MinimumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		util.RequireLocalWorkspaceFile()

		environmentName, _ := cmd.Flags().GetString("env")
		if !cmd.Flags().Changed("env") {
			environmentFromWorkspace := util.GetEnvFromWorkspaceFile()
			if environmentFromWorkspace != "" {
				environmentName = environmentFromWorkspace
			}
		}

		secretsPath, err := cmd.Flags().GetString("path")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		workspaceFile, err := util.GetWorkSpaceFromFile()
		if err != nil {
			util.HandleError(err, "Unable to get your local config details")
		}

		loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails()
		if err != nil {
			util.HandleError(err, "Unable to authenticate")
		}

		if loggedInUserDetails.LoginExpired {
			util.PrintErrorMessageAndExit("Your login session has expired, please run [infisical login] and try again")
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

		if len(currentUsersPrivateKey) == 0 || len(encryptedWorkspaceKeySenderPublicKey) == 0 {
			log.Debug().Msgf("Missing credentials for generating plainTextEncryptionKey: [currentUsersPrivateKey=%s] [encryptedWorkspaceKeySenderPublicKey=%s]", currentUsersPrivateKey, encryptedWorkspaceKeySenderPublicKey)
			util.PrintErrorMessageAndExit("Some required user credentials are missing to generate your [plainTextEncryptionKey]. Please run [infisical login] then try again")
		}

		// decrypt workspace key
		plainTextEncryptionKey := crypto.DecryptAsymmetric(encryptedWorkspaceKey, encryptedWorkspaceKeyNonce, encryptedWorkspaceKeySenderPublicKey, currentUsersPrivateKey)

		// pull current secrets
		secrets, err := util.GetAllEnvironmentVariables(models.GetAllSecretsParameters{Environment: environmentName, SecretsPath: secretsPath})
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
				util.PrintErrorMessageAndExit("ensure that each secret has a none empty key and value. Modify the input and try again")
			}

			if unicode.IsNumber(rune(splitKeyValueFromArg[0][0])) {
				util.PrintErrorMessageAndExit("keys of secrets cannot start with a number. Modify the key name(s) and try again")
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
					PlainTextKey:          key,
					Type:                  existingSecret.Type,
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
					PlainTextKey:          key,
				}
				secretsToCreate = append(secretsToCreate, encryptedSecretDetails)
				secretOperations = append(secretOperations, SecretSetOperation{
					SecretKey:       key,
					SecretValue:     value,
					SecretOperation: "SECRET CREATED",
				})
			}
		}

		for _, secret := range secretsToCreate {
			createSecretRequest := api.CreateSecretV3Request{
				WorkspaceID:           workspaceFile.WorkspaceId,
				Environment:           environmentName,
				SecretName:            secret.PlainTextKey,
				SecretKeyCiphertext:   secret.SecretKeyCiphertext,
				SecretKeyIV:           secret.SecretKeyIV,
				SecretKeyTag:          secret.SecretKeyTag,
				SecretValueCiphertext: secret.SecretValueCiphertext,
				SecretValueIV:         secret.SecretValueIV,
				SecretValueTag:        secret.SecretValueTag,
				Type:                  secret.Type,
				SecretPath:            secretsPath,
			}

			err = api.CallCreateSecretsV3(httpClient, createSecretRequest)
			if err != nil {
				util.HandleError(err, "Unable to process new secret creations")
				return
			}
		}

		for _, secret := range secretsToModify {
			updateSecretRequest := api.UpdateSecretByNameV3Request{
				WorkspaceID:           workspaceFile.WorkspaceId,
				Environment:           environmentName,
				SecretName:            secret.PlainTextKey,
				SecretValueCiphertext: secret.SecretValueCiphertext,
				SecretValueIV:         secret.SecretValueIV,
				SecretValueTag:        secret.SecretValueTag,
				Type:                  secret.Type,
				SecretPath:            secretsPath,
			}

			err = api.CallUpdateSecretsV3(httpClient, updateSecretRequest)
			if err != nil {
				util.HandleError(err, "Unable to process secret update request")
				return
			}
		}

		// Print secret operations
		headers := [...]string{"SECRET NAME", "SECRET VALUE", "STATUS"}
		rows := [][3]string{}
		for _, secretOperation := range secretOperations {
			rows = append(rows, [...]string{secretOperation.SecretKey, secretOperation.SecretValue, secretOperation.SecretOperation})
		}

		visualize.Table(headers, rows)

		Telemetry.CaptureEvent("cli-command:secrets set", posthog.NewProperties().Set("version", util.CLI_VERSION))
	},
}

var secretsDeleteCmd = &cobra.Command{
	Example:               `secrets delete <secret name A> <secret name B>..."`,
	Short:                 "Used to delete secrets by name",
	Use:                   "delete [secrets]",
	DisableFlagsInUseLine: true,
	Args:                  cobra.MinimumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		environmentName, _ := cmd.Flags().GetString("env")
		if !cmd.Flags().Changed("env") {
			environmentFromWorkspace := util.GetEnvFromWorkspaceFile()
			if environmentFromWorkspace != "" {
				environmentName = environmentFromWorkspace
			}
		}

		secretsPath, err := cmd.Flags().GetString("path")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		secretType, err := cmd.Flags().GetString("type")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails()
		if err != nil {
			util.HandleError(err, "Unable to authenticate")
		}

		if loggedInUserDetails.LoginExpired {
			util.PrintErrorMessageAndExit("Your login session has expired, please run [infisical login] and try again")
		}

		workspaceFile, err := util.GetWorkSpaceFromFile()
		if err != nil {
			util.HandleError(err, "Unable to get local project details")
		}

		for _, secretName := range args {
			request := api.DeleteSecretV3Request{
				WorkspaceId: workspaceFile.WorkspaceId,
				Environment: environmentName,
				SecretName:  secretName,
				Type:        secretType,
				SecretPath:  secretsPath,
			}

			httpClient := resty.New().
				SetAuthToken(loggedInUserDetails.UserCredentials.JTWToken).
				SetHeader("Accept", "application/json")

			err = api.CallDeleteSecretsV3(httpClient, request)
			if err != nil {
				util.HandleError(err, "Unable to complete your delete request")
			}
		}

		fmt.Printf("secret name(s) [%v] have been deleted from your project \n", strings.Join(args, ", "))

		Telemetry.CaptureEvent("cli-command:secrets delete", posthog.NewProperties().Set("secretCount", len(args)).Set("version", util.CLI_VERSION))
	},
}

func getSecretsByNames(cmd *cobra.Command, args []string) {
	environmentName, _ := cmd.Flags().GetString("env")
	if !cmd.Flags().Changed("env") {
		environmentFromWorkspace := util.GetEnvFromWorkspaceFile()
		if environmentFromWorkspace != "" {
			environmentName = environmentFromWorkspace
		}
	}

	infisicalToken, err := cmd.Flags().GetString("token")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	tagSlugs, err := cmd.Flags().GetString("tags")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	secrets, err := util.GetAllEnvironmentVariables(models.GetAllSecretsParameters{Environment: environmentName, InfisicalToken: infisicalToken, TagSlugs: tagSlugs})
	if err != nil {
		util.HandleError(err, "To fetch all secrets")
	}

	requestedSecrets := []models.SingleEnvironmentVariable{}

	secretsMap := getSecretsByKeys(secrets)

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
	Telemetry.CaptureEvent("cli-command:secrets get", posthog.NewProperties().Set("secretCount", len(secrets)).Set("version", util.CLI_VERSION))
}

func generateExampleEnv(cmd *cobra.Command, args []string) {
	environmentName, _ := cmd.Flags().GetString("env")
	if !cmd.Flags().Changed("env") {
		environmentFromWorkspace := util.GetEnvFromWorkspaceFile()
		if environmentFromWorkspace != "" {
			environmentName = environmentFromWorkspace
		}
	}

	infisicalToken, err := cmd.Flags().GetString("token")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	tagSlugs, err := cmd.Flags().GetString("tags")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	secrets, err := util.GetAllEnvironmentVariables(models.GetAllSecretsParameters{Environment: environmentName, InfisicalToken: infisicalToken, TagSlugs: tagSlugs})
	if err != nil {
		util.HandleError(err, "To fetch all secrets")
	}

	tagsHashToSecretKey := make(map[string]int)
	slugsToFilerBy := make(map[string]int)

	for _, slug := range strings.Split(tagSlugs, ",") {
		slugsToFilerBy[slug] = 1
	}

	type TagsAndSecrets struct {
		Secrets []models.SingleEnvironmentVariable
		Tags    []struct {
			ID        string `json:"_id"`
			Name      string `json:"name"`
			Slug      string `json:"slug"`
			Workspace string `json:"workspace"`
		}
	}

	// sort secrets by associated tags (most number of tags to least tags)
	sort.Slice(secrets, func(i, j int) bool {
		return len(secrets[i].Tags) > len(secrets[j].Tags)
	})

	for i, secret := range secrets {
		filteredTag := []struct {
			ID        string "json:\"_id\""
			Name      string "json:\"name\""
			Slug      string "json:\"slug\""
			Workspace string "json:\"workspace\""
		}{}

		for _, secretTag := range secret.Tags {
			_, exists := slugsToFilerBy[secretTag.Slug]
			if !exists {
				filteredTag = append(filteredTag, secretTag)
			}
		}

		secret.Tags = filteredTag
		secrets[i] = secret
	}

	for _, secret := range secrets {
		listOfTagSlugs := []string{}

		for _, tag := range secret.Tags {
			listOfTagSlugs = append(listOfTagSlugs, tag.Slug)
		}
		sort.Strings(listOfTagSlugs)

		tagsHash := util.GetHashFromStringList(listOfTagSlugs)

		tagsHashToSecretKey[tagsHash] += 1
	}

	finalTagHashToSecretKey := make(map[string]TagsAndSecrets)

	for _, secret := range secrets {
		listOfTagSlugs := []string{}
		for _, tag := range secret.Tags {
			listOfTagSlugs = append(listOfTagSlugs, tag.Slug)
		}

		// sort the slug so we get the same hash each time
		sort.Strings(listOfTagSlugs)

		tagsHash := util.GetHashFromStringList(listOfTagSlugs)
		occurrence, exists := tagsHashToSecretKey[tagsHash]
		if exists && occurrence > 0 {

			value, exists2 := finalTagHashToSecretKey[tagsHash]
			allSecretsForTags := append(value.Secrets, secret)

			// sort the the secrets by keys so that they can later be sorted by the first item in the secrets array
			sort.Slice(allSecretsForTags, func(i, j int) bool {
				return allSecretsForTags[i].Key < allSecretsForTags[j].Key
			})

			if exists2 {
				finalTagHashToSecretKey[tagsHash] = TagsAndSecrets{
					Tags:    secret.Tags,
					Secrets: allSecretsForTags,
				}
			} else {
				finalTagHashToSecretKey[tagsHash] = TagsAndSecrets{
					Tags:    secret.Tags,
					Secrets: []models.SingleEnvironmentVariable{secret},
				}
			}

			tagsHashToSecretKey[tagsHash] -= 1
		}
	}

	// sort the fianl result by secret key fo consistent print order
	listOfsecretDetails := make([]TagsAndSecrets, 0, len(finalTagHashToSecretKey))
	for _, secretDetails := range finalTagHashToSecretKey {
		listOfsecretDetails = append(listOfsecretDetails, secretDetails)
	}

	// sort the order of the headings by the order of the secrets
	sort.Slice(listOfsecretDetails, func(i, j int) bool {
		return len(listOfsecretDetails[i].Tags) < len(listOfsecretDetails[j].Tags)
	})

	tableOfContents := []string{}
	fullyGeneratedDocuments := []string{}
	for _, secretDetails := range listOfsecretDetails {
		listOfKeyValue := []string{}

		for _, secret := range secretDetails.Secrets {
			re := regexp.MustCompile(`(?s)(.*)DEFAULT:(.*)`)
			match := re.FindStringSubmatch(secret.Comment)
			defaultValue := ""
			comment := secret.Comment

			// Case: Only has default value
			if len(match) == 2 {
				defaultValue = strings.TrimSpace(match[1])
			}

			// Case: has a comment and a default value
			if len(match) == 3 {
				comment = match[1]
				defaultValue = match[2]
			}

			row := ""
			if comment != "" {
				comment = addHash(comment)
				row = fmt.Sprintf("%s \n%s=%s", strings.TrimSpace(comment), strings.TrimSpace(secret.Key), strings.TrimSpace(defaultValue))
			} else {
				row = fmt.Sprintf("%s=%s", strings.TrimSpace(secret.Key), strings.TrimSpace(defaultValue))
			}

			// each secret row to be added to the file
			listOfKeyValue = append(listOfKeyValue, row)
		}

		listOfTagNames := []string{}
		for _, tag := range secretDetails.Tags {
			listOfTagNames = append(listOfTagNames, tag.Name)
		}

		heading := CenterString(strings.Join(listOfTagNames, " & "), 80)

		if len(listOfTagNames) == 0 {
			fullyGeneratedDocuments = append(fullyGeneratedDocuments, fmt.Sprintf("\n%s \n", strings.Join(listOfKeyValue, "\n")))
		} else {
			fullyGeneratedDocuments = append(fullyGeneratedDocuments, fmt.Sprintf("\n\n\n%s \n%s \n", heading, strings.Join(listOfKeyValue, "\n")))
			tableOfContents = append(tableOfContents, strings.ToUpper(strings.Join(listOfTagNames, " & ")))
		}
	}

	dashedList := []string{}
	for _, item := range tableOfContents {
		dashedList = append(dashedList, fmt.Sprintf("# - %s \n", item))
	}
	if len(dashedList) > 0 {
		fmt.Println(CenterString("TABLE OF CONTENTS", 80))
		fmt.Println(strings.Join(dashedList, ""))
	}
	fmt.Println(strings.Join(fullyGeneratedDocuments, ""))

	Telemetry.CaptureEvent("cli-command:generate-example-env", posthog.NewProperties().Set("secretCount", len(secrets)).Set("version", util.CLI_VERSION))
}

func CenterString(s string, numStars int) string {
	stars := strings.Repeat("*", numStars)
	padding := (numStars - len(s)) / 2
	cenetredTextWithStar := stars[:padding] + " " + strings.ToUpper(s) + " " + stars[padding:]

	hashes := strings.Repeat("#", len(cenetredTextWithStar)+2)
	return fmt.Sprintf("%s \n# %s \n%s", hashes, cenetredTextWithStar, hashes)
}

func addHash(input string) string {
	lines := strings.Split(input, "\n")
	for i, line := range lines {
		lines[i] = "# " + line
	}
	return strings.Join(lines, "\n")
}

func getSecretsByKeys(secrets []models.SingleEnvironmentVariable) map[string]models.SingleEnvironmentVariable {
	secretMapByName := make(map[string]models.SingleEnvironmentVariable, len(secrets))

	for _, secret := range secrets {
		secretMapByName[secret.Key] = secret
	}

	return secretMapByName
}

func init() {

	secretsGenerateExampleEnvCmd.Flags().String("token", "", "Fetch secrets using the Infisical Token")
	secretsCmd.AddCommand(secretsGenerateExampleEnvCmd)

	secretsGetCmd.Flags().String("token", "", "Fetch secrets using the Infisical Token")
	secretsCmd.AddCommand(secretsGetCmd)

	secretsCmd.Flags().Bool("secret-overriding", true, "Prioritizes personal secrets, if any, with the same name over shared secrets")
	secretsCmd.AddCommand(secretsSetCmd)
	secretsSetCmd.Flags().String("path", "/", "get secrets within a folder path")

	secretsSetCmd.PersistentPreRun = func(cmd *cobra.Command, args []string) {
		util.RequireLogin()
		util.RequireLocalWorkspaceFile()
	}

	secretsDeleteCmd.Flags().String("type", "personal", "the type of secret to delete: personal or shared  (default: personal)")
	secretsDeleteCmd.Flags().String("path", "/", "get secrets within a folder path")
	secretsCmd.AddCommand(secretsDeleteCmd)
	secretsDeleteCmd.PersistentPreRun = func(cmd *cobra.Command, args []string) {
		util.RequireLogin()
		util.RequireLocalWorkspaceFile()
	}

	secretsCmd.Flags().String("token", "", "Fetch secrets using the Infisical Token")
	secretsCmd.PersistentFlags().String("env", "dev", "Used to select the environment name on which actions should be taken on")
	secretsCmd.Flags().Bool("expand", true, "Parse shell parameter expansions in your secrets")
	secretsCmd.Flags().Bool("include-imports", true, "Imported linked secrets ")
	secretsCmd.PersistentFlags().StringP("tags", "t", "", "filter secrets by tag slugs")
	secretsCmd.Flags().String("path", "/", "get secrets within a folder path")
	rootCmd.AddCommand(secretsCmd)
}
