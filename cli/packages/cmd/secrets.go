/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/Infisical/infisical-merge/packages/visualize"
	"github.com/go-resty/resty/v2"
	"github.com/posthog/posthog-go"
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

		token, err := util.GetInfisicalToken(cmd)
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		projectId, err := cmd.Flags().GetString("projectId")
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

		recursive, err := cmd.Flags().GetBool("recursive")
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

		plainOutput, err := cmd.Flags().GetBool("plain")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		request := models.GetAllSecretsParameters{
			Environment:            environmentName,
			WorkspaceId:            projectId,
			TagSlugs:               tagSlugs,
			SecretsPath:            secretsPath,
			IncludeImport:          includeImports,
			Recursive:              recursive,
			ExpandSecretReferences: shouldExpandSecrets,
		}

		if token != nil && token.Type == util.SERVICE_TOKEN_IDENTIFIER {
			request.InfisicalToken = token.Token
		} else if token != nil && token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER {
			request.UniversalAuthAccessToken = token.Token
		}

		secrets, err := util.GetAllEnvironmentVariables(request, "")
		if err != nil {
			util.HandleError(err)
		}

		if secretOverriding {
			secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_PERSONAL)
		} else {
			secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_SHARED)
		}

		// Sort the secrets by key so we can create a consistent output
		secrets = util.SortSecretsByKeys(secrets)

		if plainOutput {
			for _, secret := range secrets {
				fmt.Println(secret.Value)
			}
		} else {
			visualize.PrintAllSecretDetails(secrets)
		}

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
		token, err := util.GetInfisicalToken(cmd)
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		if token == nil {
			util.RequireLocalWorkspaceFile()
		}

		environmentName, _ := cmd.Flags().GetString("env")
		if !cmd.Flags().Changed("env") {
			environmentFromWorkspace := util.GetEnvFromWorkspaceFile()
			if environmentFromWorkspace != "" {
				environmentName = environmentFromWorkspace
			}
		}

		projectId, err := cmd.Flags().GetString("projectId")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		secretsPath, err := cmd.Flags().GetString("path")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		secretType, err := cmd.Flags().GetString("type")
		if err != nil || (secretType != util.SECRET_TYPE_SHARED && secretType != util.SECRET_TYPE_PERSONAL) {
			util.HandleError(err, "Unable to parse secret type")
		}

		var secretOperations []models.SecretSetOperation
		if token != nil && (token.Type == util.SERVICE_TOKEN_IDENTIFIER || token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER) {
			if projectId == "" {
				util.PrintErrorMessageAndExit("When using service tokens or machine identities, you must set the --projectId flag")
			}

			secretOperations, err = util.SetRawSecrets(args, secretType, environmentName, secretsPath, projectId, token)
		} else {
			if projectId == "" {
				workspaceFile, err := util.GetWorkSpaceFromFile()
				if err != nil {
					util.HandleError(err, "unable to get your local config details [err=%v]")
				}

				projectId = workspaceFile.WorkspaceId
			}

			loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails()
			if err != nil {
				util.HandleError(err, "unable to authenticate [err=%v]")
			}

			if loggedInUserDetails.LoginExpired {
				util.PrintErrorMessageAndExit("Your login session has expired, please run [infisical login] and try again")
			}

			secretOperations, err = util.SetRawSecrets(args, secretType, environmentName, secretsPath, projectId, &models.TokenDetails{
				Type:  "",
				Token: loggedInUserDetails.UserCredentials.JTWToken,
			})
		}

		if err != nil {
			util.HandleError(err, "Unable to set secrets")
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

		token, err := util.GetInfisicalToken(cmd)
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		projectId, err := cmd.Flags().GetString("projectId")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		secretsPath, err := cmd.Flags().GetString("path")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		secretType, err := cmd.Flags().GetString("type")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		httpClient := resty.New().
			SetHeader("Accept", "application/json")

		if projectId == "" {
			workspaceFile, err := util.GetWorkSpaceFromFile()
			if err != nil {
				util.HandleError(err, "Unable to get local project details")
			}
			projectId = workspaceFile.WorkspaceId
		}

		if token != nil && (token.Type == util.SERVICE_TOKEN_IDENTIFIER || token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER) {
			httpClient.SetAuthToken(token.Token)
		} else {
			util.RequireLogin()
			util.RequireLocalWorkspaceFile()

			loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails()
			if err != nil {
				util.HandleError(err, "Unable to authenticate")
			}

			if loggedInUserDetails.LoginExpired {
				util.PrintErrorMessageAndExit("Your login session has expired, please run [infisical login] and try again")
			}

			httpClient.SetAuthToken(loggedInUserDetails.UserCredentials.JTWToken)
		}

		for _, secretName := range args {
			request := api.DeleteSecretV3Request{
				WorkspaceId: projectId,
				Environment: environmentName,
				SecretName:  secretName,
				Type:        secretType,
				SecretPath:  secretsPath,
			}

			err = api.CallDeleteSecretsRawV3(httpClient, request)
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

	token, err := util.GetInfisicalToken(cmd)
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	shouldExpand, err := cmd.Flags().GetBool("expand")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	tagSlugs, err := cmd.Flags().GetString("tags")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	projectId, err := cmd.Flags().GetString("projectId")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	secretsPath, err := cmd.Flags().GetString("path")
	if err != nil {
		util.HandleError(err, "Unable to parse path flag")
	}

	recursive, err := cmd.Flags().GetBool("recursive")
	if err != nil {
		util.HandleError(err, "Unable to parse recursive flag")
	}

	// deprecated, in favor of --plain
	showOnlyValue, err := cmd.Flags().GetBool("raw-value")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	plainOutput, err := cmd.Flags().GetBool("plain")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	includeImports, err := cmd.Flags().GetBool("include-imports")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	secretOverriding, err := cmd.Flags().GetBool("secret-overriding")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	request := models.GetAllSecretsParameters{
		Environment:            environmentName,
		WorkspaceId:            projectId,
		TagSlugs:               tagSlugs,
		SecretsPath:            secretsPath,
		IncludeImport:          includeImports,
		Recursive:              recursive,
		ExpandSecretReferences: shouldExpand,
	}

	if token != nil && token.Type == util.SERVICE_TOKEN_IDENTIFIER {
		request.InfisicalToken = token.Token
	} else if token != nil && token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER {
		request.UniversalAuthAccessToken = token.Token
	}

	secrets, err := util.GetAllEnvironmentVariables(request, "")
	if err != nil {
		util.HandleError(err, "To fetch all secrets")
	}

	if secretOverriding {
		secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_PERSONAL)
	} else {
		secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_SHARED)
	}

	requestedSecrets := []models.SingleEnvironmentVariable{}

	secretsMap := getSecretsByKeys(secrets)

	for _, secretKeyFromArg := range args {
		if value, ok := secretsMap[secretKeyFromArg]; ok {
			requestedSecrets = append(requestedSecrets, value)
		} else {
			if !(plainOutput || showOnlyValue) {
				requestedSecrets = append(requestedSecrets, models.SingleEnvironmentVariable{
					Key:   secretKeyFromArg,
					Type:  "*not found*",
					Value: "*not found*",
				})
			}
		}
	}

	// showOnlyValue deprecated in favor of --plain, below only for backward compatibility
	if plainOutput || showOnlyValue {
		for _, secret := range requestedSecrets {
			fmt.Println(secret.Value)
		}
	} else {
		visualize.PrintAllSecretDetails(requestedSecrets)
	}

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

	secretsPath, err := cmd.Flags().GetString("path")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	token, err := util.GetInfisicalToken(cmd)
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	projectId, err := cmd.Flags().GetString("projectId")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	tagSlugs, err := cmd.Flags().GetString("tags")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	request := models.GetAllSecretsParameters{
		Environment:   environmentName,
		WorkspaceId:   projectId,
		TagSlugs:      tagSlugs,
		SecretsPath:   secretsPath,
		IncludeImport: true,
	}

	if token != nil && token.Type == util.SERVICE_TOKEN_IDENTIFIER {
		request.InfisicalToken = token.Token
	} else if token != nil && token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER {
		request.UniversalAuthAccessToken = token.Token
	}

	secrets, err := util.GetAllEnvironmentVariables(request, "")
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
	cenetredTextWithStar := stars[:padding] + " " + s + " " + stars[padding:]

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
	secretsGenerateExampleEnvCmd.Flags().String("token", "", "Fetch secrets using service token or machine identity access token")
	secretsGenerateExampleEnvCmd.Flags().String("projectId", "", "manually set the projectId when using machine identity based auth")
	secretsGenerateExampleEnvCmd.Flags().String("path", "/", "Fetch secrets from within a folder path")
	secretsCmd.AddCommand(secretsGenerateExampleEnvCmd)

	secretsGetCmd.Flags().String("token", "", "Fetch secrets using service token or machine identity access token")
	secretsGetCmd.Flags().String("projectId", "", "manually set the project ID to fetch secrets from when using machine identity based auth")
	secretsGetCmd.Flags().String("path", "/", "get secrets within a folder path")
	secretsGetCmd.Flags().Bool("plain", false, "print values without formatting, one per line")
	secretsGetCmd.Flags().Bool("raw-value", false, "deprecated. Returns only the value of secret, only works with one secret. Use --plain instead")
	secretsGetCmd.Flags().Bool("include-imports", true, "Imported linked secrets ")
	secretsGetCmd.Flags().Bool("expand", true, "Parse shell parameter expansions in your secrets, and process your referenced secrets")
	secretsGetCmd.Flags().Bool("recursive", false, "Fetch secrets from all sub-folders")
	secretsGetCmd.Flags().Bool("secret-overriding", true, "Prioritizes personal secrets, if any, with the same name over shared secrets")
	secretsCmd.AddCommand(secretsGetCmd)
	secretsCmd.Flags().Bool("secret-overriding", true, "Prioritizes personal secrets, if any, with the same name over shared secrets")
	secretsCmd.AddCommand(secretsSetCmd)
	secretsSetCmd.Flags().String("token", "", "Fetch secrets using service token or machine identity access token")
	secretsSetCmd.Flags().String("projectId", "", "manually set the project ID to for setting secrets when using machine identity based auth")
	secretsSetCmd.Flags().String("path", "/", "set secrets within a folder path")
	secretsSetCmd.Flags().String("type", util.SECRET_TYPE_SHARED, "the type of secret to create: personal or shared")

	secretsDeleteCmd.Flags().String("type", "personal", "the type of secret to delete: personal or shared  (default: personal)")
	secretsDeleteCmd.Flags().String("token", "", "Fetch secrets using service token or machine identity access token")
	secretsDeleteCmd.Flags().String("projectId", "", "manually set the projectId to delete secrets from when using machine identity based auth")
	secretsDeleteCmd.Flags().String("path", "/", "get secrets within a folder path")
	secretsCmd.AddCommand(secretsDeleteCmd)

	// *** Folders sub command ***
	folderCmd.PersistentFlags().String("env", "dev", "Used to select the environment name on which actions should be taken on")

	// Add getCmd, createCmd and deleteCmd flags here
	getCmd.Flags().StringP("path", "p", "/", "The path from where folders should be fetched from")
	getCmd.Flags().String("token", "", "Fetch secrets using service token or machine identity access token")
	getCmd.Flags().String("projectId", "", "manually set the projectId to fetch folders from when using machine identity based auth")
	folderCmd.AddCommand(getCmd)

	// Add createCmd flags here
	createCmd.Flags().StringP("path", "p", "/", "Path to where the folder should be created")
	createCmd.Flags().StringP("name", "n", "", "Name of the folder to be created in selected `--path`")
	createCmd.Flags().String("token", "", "Fetch secrets using service token or machine identity access token")
	createCmd.Flags().String("projectId", "", "manually set the project ID for creating folders in when using machine identity based auth")
	folderCmd.AddCommand(createCmd)

	// Add deleteCmd flags here
	deleteCmd.Flags().StringP("path", "p", "/", "Path to the folder to be deleted")
	deleteCmd.Flags().String("token", "", "Fetch secrets using service token or machine identity access token")
	deleteCmd.Flags().String("projectId", "", "manually set the projectId to delete folders when using machine identity based auth")
	deleteCmd.Flags().StringP("name", "n", "", "Name of the folder to be deleted within selected `--path`")
	folderCmd.AddCommand(deleteCmd)

	secretsCmd.AddCommand(folderCmd)

	// ** End of folders sub command

	secretsCmd.Flags().String("token", "", "Fetch secrets using service token or machine identity access token")
	secretsCmd.Flags().String("projectId", "", "manually set the projectId to fetch secrets when using machine identity based auth")
	secretsCmd.PersistentFlags().String("env", "dev", "Used to select the environment name on which actions should be taken on")
	secretsCmd.Flags().Bool("expand", true, "Parse shell parameter expansions in your secrets, and process your referenced secrets")
	secretsCmd.Flags().Bool("include-imports", true, "Imported linked secrets ")
	secretsCmd.Flags().Bool("recursive", false, "Fetch secrets from all sub-folders")
	secretsCmd.PersistentFlags().StringP("tags", "t", "", "filter secrets by tag slugs")
	secretsCmd.Flags().String("path", "/", "get secrets within a folder path")
	secretsCmd.Flags().Bool("plain", false, "print values without formatting, one per line")
	rootCmd.AddCommand(secretsCmd)
}
