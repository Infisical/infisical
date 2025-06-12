/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"context"
	"fmt"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/visualize"

	// "github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	// "github.com/Infisical/infisical-merge/packages/visualize"
	"github.com/posthog/posthog-go"
	"github.com/spf13/cobra"

	infisicalSdk "github.com/infisical/go-sdk"
	infisicalSdkModels "github.com/infisical/go-sdk/packages/models"
)

var dynamicSecretCmd = &cobra.Command{
	Example:               `infisical dynamic-secrets`,
	Short:                 "Used to list dynamic secrets",
	Use:                   "dynamic-secrets",
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
	Run:                   getDynamicSecretList,
}

func getDynamicSecretList(cmd *cobra.Command, args []string) {
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

	projectSlug, err := cmd.Flags().GetString("project-slug")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	secretsPath, err := cmd.Flags().GetString("path")
	if err != nil {
		util.HandleError(err, "Unable to parse path flag")
	}

	var infisicalToken string
	httpClient, err := util.GetRestyClientWithCustomHeaders()
	if err != nil {
		util.HandleError(err, "Unable to get resty client with custom headers")
	}

	if projectId == "" && projectSlug == "" {
		workspaceFile, err := util.GetWorkSpaceFromFile()
		if err != nil {
			util.PrintErrorMessageAndExit("Please either run infisical init to connect to a project, pass in project slug with --project-slug flag, or pass in project id with --projectId flag")
		}
		projectId = workspaceFile.WorkspaceId
	}

	if token != nil && (token.Type == util.SERVICE_TOKEN_IDENTIFIER || token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER) {
		infisicalToken = token.Token
	} else {
		util.RequireLogin()

		loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails(true)
		if err != nil {
			util.HandleError(err, "Unable to authenticate")
		}

		if loggedInUserDetails.LoginExpired {
			loggedInUserDetails = util.EstablishUserLoginSession()
		}

		infisicalToken = loggedInUserDetails.UserCredentials.JTWToken
	}

	httpClient.SetAuthToken(infisicalToken)

	customHeaders, err := util.GetInfisicalCustomHeadersMap()
	if err != nil {
		util.HandleError(err, "Unable to get custom headers")
	}

	infisicalClient := infisicalSdk.NewInfisicalClient(context.Background(), infisicalSdk.Config{
		SiteUrl:          config.INFISICAL_URL,
		UserAgent:        api.USER_AGENT,
		AutoTokenRefresh: false,
		CustomHeaders:    customHeaders,
	})
	infisicalClient.Auth().SetAccessToken(infisicalToken)

	if projectSlug == "" {
		projectDetails, err := api.CallGetProjectById(httpClient, projectId)
		if err != nil {
			util.HandleError(err, "To fetch project details")
		}
		projectSlug = projectDetails.Slug
	}

	dynamicSecretRootCredentials, err := infisicalClient.DynamicSecrets().List(infisicalSdk.ListDynamicSecretsRootCredentialsOptions{
		ProjectSlug:     projectSlug,
		SecretPath:      secretsPath,
		EnvironmentSlug: environmentName,
	})

	if err != nil {
		util.HandleError(err, "To fetch dynamic secret root credentials details")
	}

	visualize.PrintAllDynamicRootCredentials(dynamicSecretRootCredentials)
	Telemetry.CaptureEvent("cli-command:dynamic-secrets", posthog.NewProperties().Set("count", len(dynamicSecretRootCredentials)).Set("version", util.CLI_VERSION))
}

var dynamicSecretLeaseCmd = &cobra.Command{
	Example:               `lease`,
	Short:                 "Manage leases for dynamic secrets",
	Use:                   "lease",
	DisableFlagsInUseLine: true,
}

var dynamicSecretLeaseCreateCmd = &cobra.Command{
	Example:               `lease create <dynamic secret name>"`,
	Short:                 "Used to lease dynamic secret by name",
	Use:                   "create [dynamic-secret]",
	DisableFlagsInUseLine: true,
	Args:                  cobra.ExactArgs(1),
	Run:                   createDynamicSecretLeaseByName,
}

func createDynamicSecretLeaseByName(cmd *cobra.Command, args []string) {
	dynamicSecretRootCredentialName := args[0]

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

	projectSlug, err := cmd.Flags().GetString("project-slug")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	ttl, err := cmd.Flags().GetString("ttl")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	secretsPath, err := cmd.Flags().GetString("path")
	if err != nil {
		util.HandleError(err, "Unable to parse path flag")
	}

	plainOutput, err := cmd.Flags().GetBool("plain")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	var infisicalToken string
	httpClient, err := util.GetRestyClientWithCustomHeaders()
	if err != nil {
		util.HandleError(err, "Unable to get resty client with custom headers")
	}

	if projectId == "" && projectSlug == "" {
		workspaceFile, err := util.GetWorkSpaceFromFile()
		if err != nil {
			util.PrintErrorMessageAndExit("Please either run infisical init to connect to a project, pass in project id with --projectId flag, or pass in project slug with --project-slug flag")
		}
		projectId = workspaceFile.WorkspaceId
	}

	if token != nil && (token.Type == util.SERVICE_TOKEN_IDENTIFIER || token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER) {
		infisicalToken = token.Token
	} else {
		util.RequireLogin()

		loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails(true)
		if err != nil {
			util.HandleError(err, "Unable to authenticate")
		}

		if loggedInUserDetails.LoginExpired {
			loggedInUserDetails = util.EstablishUserLoginSession()
		}
		infisicalToken = loggedInUserDetails.UserCredentials.JTWToken
	}

	httpClient.SetAuthToken(infisicalToken)

	customHeaders, err := util.GetInfisicalCustomHeadersMap()
	if err != nil {
		util.HandleError(err, "Unable to get custom headers")
	}

	infisicalClient := infisicalSdk.NewInfisicalClient(context.Background(), infisicalSdk.Config{
		SiteUrl:          config.INFISICAL_URL,
		UserAgent:        api.USER_AGENT,
		AutoTokenRefresh: false,
		CustomHeaders:    customHeaders,
	})
	infisicalClient.Auth().SetAccessToken(infisicalToken)

	if projectSlug == "" {
		projectDetails, err := api.CallGetProjectById(httpClient, projectId)
		if err != nil {
			util.HandleError(err, "To fetch project details")
		}
		projectSlug = projectDetails.Slug
	}

	dynamicSecretRootCredential, err := infisicalClient.DynamicSecrets().GetByName(infisicalSdk.GetDynamicSecretRootCredentialByNameOptions{
		DynamicSecretName: dynamicSecretRootCredentialName,
		ProjectSlug:       projectSlug,
		SecretPath:        secretsPath,
		EnvironmentSlug:   environmentName,
	})

	if err != nil {
		util.HandleError(err, "To fetch dynamic secret root credentials details")
	}

	// for Kubernetes dynamic secrets only
	kubernetesNamespace, err := cmd.Flags().GetString("kubernetes-namespace")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	config := map[string]any{}
	if kubernetesNamespace != "" {
		config["namespace"] = kubernetesNamespace
	}

	leaseCredentials, _, leaseDetails, err := infisicalClient.DynamicSecrets().Leases().Create(infisicalSdk.CreateDynamicSecretLeaseOptions{
		DynamicSecretName: dynamicSecretRootCredential.Name,
		ProjectSlug:       projectSlug,
		TTL:               ttl,
		SecretPath:        secretsPath,
		EnvironmentSlug:   environmentName,
		Config:            config,
	})

	if err != nil {
		util.HandleError(err, "To lease dynamic secret")
	}

	if plainOutput {
		for key, value := range leaseCredentials {
			if cred, ok := value.(string); ok {
				fmt.Printf("%s=%s\n", key, cred)
			}
		}
	} else {
		fmt.Println("Dynamic Secret Leasing")
		fmt.Printf("Name: %s\n", dynamicSecretRootCredential.Name)
		fmt.Printf("Provider: %s\n", dynamicSecretRootCredential.Type)
		fmt.Printf("Lease ID: %s\n", leaseDetails.Id)
		fmt.Printf("Expire At: %s\n", leaseDetails.ExpireAt.Local().Format("02-Jan-2006 03:04:05 PM"))
		visualize.PrintAllDyamicSecretLeaseCredentials(leaseCredentials)
	}

	Telemetry.CaptureEvent("cli-command:dynamic-secrets lease", posthog.NewProperties().Set("type", dynamicSecretRootCredential.Type).Set("version", util.CLI_VERSION))
}

var dynamicSecretLeaseRenewCmd = &cobra.Command{
	Example:               `lease renew <dynamic secret name>"`,
	Short:                 "Used to renew dynamic secret lease by name",
	Use:                   "renew [lease-id]",
	DisableFlagsInUseLine: true,
	Args:                  cobra.ExactArgs(1),
	Run:                   renewDynamicSecretLeaseByName,
}

func renewDynamicSecretLeaseByName(cmd *cobra.Command, args []string) {
	dynamicSecretLeaseId := args[0]

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

	projectSlug, err := cmd.Flags().GetString("project-slug")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	ttl, err := cmd.Flags().GetString("ttl")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	secretsPath, err := cmd.Flags().GetString("path")
	if err != nil {
		util.HandleError(err, "Unable to parse path flag")
	}

	var infisicalToken string
	httpClient, err := util.GetRestyClientWithCustomHeaders()
	if err != nil {
		util.HandleError(err, "Unable to get resty client with custom headers")
	}

	if projectId == "" && projectSlug == "" {
		workspaceFile, err := util.GetWorkSpaceFromFile()
		if err != nil {
			util.PrintErrorMessageAndExit("Please either run infisical init to connect to a project, pass in project slug with --project-slug flag, or pass in project id with --projectId flag")
		}
		projectId = workspaceFile.WorkspaceId
	}

	if token != nil && (token.Type == util.SERVICE_TOKEN_IDENTIFIER || token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER) {
		infisicalToken = token.Token
	} else {
		util.RequireLogin()

		loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails(true)
		if err != nil {
			util.HandleError(err, "Unable to authenticate")
		}

		if loggedInUserDetails.LoginExpired {
			loggedInUserDetails = util.EstablishUserLoginSession()
		}

		infisicalToken = loggedInUserDetails.UserCredentials.JTWToken
	}

	httpClient.SetAuthToken(infisicalToken)

	customHeaders, err := util.GetInfisicalCustomHeadersMap()
	if err != nil {
		util.HandleError(err, "Unable to get custom headers")
	}

	infisicalClient := infisicalSdk.NewInfisicalClient(context.Background(), infisicalSdk.Config{
		SiteUrl:          config.INFISICAL_URL,
		UserAgent:        api.USER_AGENT,
		AutoTokenRefresh: false,
		CustomHeaders:    customHeaders,
	})
	infisicalClient.Auth().SetAccessToken(infisicalToken)

	if projectSlug == "" {
		projectDetails, err := api.CallGetProjectById(httpClient, projectId)
		if err != nil {
			util.HandleError(err, "To fetch project details")
		}
		projectSlug = projectDetails.Slug
	}

	if err != nil {
		util.HandleError(err, "To fetch dynamic secret root credentials details")
	}

	leaseDetails, err := infisicalClient.DynamicSecrets().Leases().RenewById(infisicalSdk.RenewDynamicSecretLeaseOptions{
		ProjectSlug:     projectSlug,
		TTL:             ttl,
		SecretPath:      secretsPath,
		EnvironmentSlug: environmentName,
		LeaseId:         dynamicSecretLeaseId,
	})
	if err != nil {
		util.HandleError(err, "To renew dynamic secret lease")
	}

	fmt.Println("Successfully renewed dynamic secret lease")
	visualize.PrintAllDynamicSecretLeases([]infisicalSdkModels.DynamicSecretLease{leaseDetails})

	Telemetry.CaptureEvent("cli-command:dynamic-secrets lease renew", posthog.NewProperties().Set("version", util.CLI_VERSION))
}

var dynamicSecretLeaseRevokeCmd = &cobra.Command{
	Example:               `lease delete <dynamic secret name>"`,
	Short:                 "Used to delete dynamic secret lease by name",
	Use:                   "delete [lease-id]",
	DisableFlagsInUseLine: true,
	Args:                  cobra.ExactArgs(1),
	Run:                   revokeDynamicSecretLeaseByName,
}

func revokeDynamicSecretLeaseByName(cmd *cobra.Command, args []string) {
	dynamicSecretLeaseId := args[0]

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

	projectSlug, err := cmd.Flags().GetString("project-slug")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	secretsPath, err := cmd.Flags().GetString("path")
	if err != nil {
		util.HandleError(err, "Unable to parse path flag")
	}

	var infisicalToken string
	httpClient, err := util.GetRestyClientWithCustomHeaders()
	if err != nil {
		util.HandleError(err, "Unable to get resty client with custom headers")
	}

	if projectId == "" && projectSlug == "" {
		workspaceFile, err := util.GetWorkSpaceFromFile()
		if err != nil {
			util.PrintErrorMessageAndExit("Please either run infisical init to connect to a project, pass in project slug with --project-slug flag, or pass in project id with --projectId flag")
		}
		projectId = workspaceFile.WorkspaceId
	}

	if token != nil && (token.Type == util.SERVICE_TOKEN_IDENTIFIER || token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER) {
		infisicalToken = token.Token
	} else {
		util.RequireLogin()

		loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails(true)
		if err != nil {
			util.HandleError(err, "Unable to authenticate")
		}

		if loggedInUserDetails.LoginExpired {
			loggedInUserDetails = util.EstablishUserLoginSession()
		}

		infisicalToken = loggedInUserDetails.UserCredentials.JTWToken
	}

	httpClient.SetAuthToken(infisicalToken)

	customHeaders, err := util.GetInfisicalCustomHeadersMap()
	if err != nil {
		util.HandleError(err, "Unable to get custom headers")
	}

	infisicalClient := infisicalSdk.NewInfisicalClient(context.Background(), infisicalSdk.Config{
		SiteUrl:          config.INFISICAL_URL,
		UserAgent:        api.USER_AGENT,
		AutoTokenRefresh: false,
		CustomHeaders:    customHeaders,
	})
	infisicalClient.Auth().SetAccessToken(infisicalToken)

	if projectSlug == "" {
		projectDetails, err := api.CallGetProjectById(httpClient, projectId)
		if err != nil {
			util.HandleError(err, "To fetch project details")
		}
		projectSlug = projectDetails.Slug
	}

	if err != nil {
		util.HandleError(err, "To fetch dynamic secret root credentials details")
	}

	leaseDetails, err := infisicalClient.DynamicSecrets().Leases().DeleteById(infisicalSdk.DeleteDynamicSecretLeaseOptions{
		ProjectSlug:     projectSlug,
		SecretPath:      secretsPath,
		EnvironmentSlug: environmentName,
		LeaseId:         dynamicSecretLeaseId,
	})

	if err != nil {
		util.HandleError(err, "To revoke  dynamic secret lease")
	}

	fmt.Println("Successfully revoked dynamic secret lease")
	visualize.PrintAllDynamicSecretLeases([]infisicalSdkModels.DynamicSecretLease{leaseDetails})

	Telemetry.CaptureEvent("cli-command:dynamic-secrets lease revoke", posthog.NewProperties().Set("version", util.CLI_VERSION))
}

var dynamicSecretLeaseListCmd = &cobra.Command{
	Example:               `lease list <dynamic secret name>"`,
	Short:                 "Used to list leases of a dynamic secret by name",
	Use:                   "list [dynamic-secret]",
	DisableFlagsInUseLine: true,
	Args:                  cobra.ExactArgs(1),
	Run:                   listDynamicSecretLeaseByName,
}

func listDynamicSecretLeaseByName(cmd *cobra.Command, args []string) {
	dynamicSecretRootCredentialName := args[0]

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

	projectSlug, err := cmd.Flags().GetString("project-slug")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	secretsPath, err := cmd.Flags().GetString("path")
	if err != nil {
		util.HandleError(err, "Unable to parse path flag")
	}

	var infisicalToken string
	httpClient, err := util.GetRestyClientWithCustomHeaders()
	if err != nil {
		util.HandleError(err, "Unable to get resty client with custom headers")
	}

	if projectId == "" && projectSlug == "" {
		workspaceFile, err := util.GetWorkSpaceFromFile()
		if err != nil {
			util.PrintErrorMessageAndExit("Please either run infisical init to connect to a project, pass in project slug with --project-slug flag, or pass in project id with --projectId flag")
		}
		projectId = workspaceFile.WorkspaceId
	}

	if token != nil && (token.Type == util.SERVICE_TOKEN_IDENTIFIER || token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER) {
		infisicalToken = token.Token
	} else {
		util.RequireLogin()

		loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails(true)
		if err != nil {
			util.HandleError(err, "Unable to authenticate")
		}

		if loggedInUserDetails.LoginExpired {
			loggedInUserDetails = util.EstablishUserLoginSession()
		}
		infisicalToken = loggedInUserDetails.UserCredentials.JTWToken
	}

	httpClient.SetAuthToken(infisicalToken)

	customHeaders, err := util.GetInfisicalCustomHeadersMap()
	if err != nil {
		util.HandleError(err, "Unable to get custom headers")
	}

	infisicalClient := infisicalSdk.NewInfisicalClient(context.Background(), infisicalSdk.Config{
		SiteUrl:          config.INFISICAL_URL,
		UserAgent:        api.USER_AGENT,
		AutoTokenRefresh: false,
		CustomHeaders:    customHeaders,
	})
	infisicalClient.Auth().SetAccessToken(infisicalToken)

	if projectSlug == "" {
		projectDetails, err := api.CallGetProjectById(httpClient, projectId)
		if err != nil {
			util.HandleError(err, "To fetch project details")
		}
		projectSlug = projectDetails.Slug
	}

	dynamicSecretLeases, err := infisicalClient.DynamicSecrets().Leases().List(infisicalSdk.ListDynamicSecretLeasesOptions{
		DynamicSecretName: dynamicSecretRootCredentialName,
		ProjectSlug:       projectSlug,
		SecretPath:        secretsPath,
		EnvironmentSlug:   environmentName,
	})

	if err != nil {
		util.HandleError(err, "To fetch dynamic secret leases list")
	}

	visualize.PrintAllDynamicSecretLeases(dynamicSecretLeases)
	Telemetry.CaptureEvent("cli-command:dynamic-secrets lease list", posthog.NewProperties().Set("lease-count", len(dynamicSecretLeases)).Set("version", util.CLI_VERSION))
}

func init() {
	dynamicSecretLeaseCreateCmd.Flags().StringP("path", "p", "/", "The path from where dynamic secret should be leased from")
	dynamicSecretLeaseCreateCmd.Flags().String("token", "", "Create dynamic secret leases using machine identity access token")
	dynamicSecretLeaseCreateCmd.Flags().String("projectId", "", "Manually set the projectId to fetch leased from when using machine identity based auth")
	dynamicSecretLeaseCreateCmd.Flags().String("project-slug", "", "Manually set the project-slug to create lease in")
	dynamicSecretLeaseCreateCmd.Flags().String("ttl", "", "The lease lifetime TTL. If not provided the default TTL of dynamic secret will be used.")
	dynamicSecretLeaseCreateCmd.Flags().Bool("plain", false, "Print leased credentials without formatting, one per line")

	// Kubernetes specific flags
	dynamicSecretLeaseCreateCmd.Flags().String("kubernetes-namespace", "", "The namespace to create the lease in. Only used for Kubernetes dynamic secrets.")

	dynamicSecretLeaseCmd.AddCommand(dynamicSecretLeaseCreateCmd)

	dynamicSecretLeaseListCmd.Flags().StringP("path", "p", "/", "The path from where dynamic secret should be leased from")
	dynamicSecretLeaseListCmd.Flags().String("token", "", "Fetch dynamic secret leases machine identity access token")
	dynamicSecretLeaseListCmd.Flags().String("projectId", "", "Manually set the projectId to fetch leased from when using machine identity based auth")
	dynamicSecretLeaseListCmd.Flags().String("project-slug", "", "Manually set the project-slug to list leases from")
	dynamicSecretLeaseCmd.AddCommand(dynamicSecretLeaseListCmd)

	dynamicSecretLeaseRenewCmd.Flags().StringP("path", "p", "/", "The path from where dynamic secret should be leased from")
	dynamicSecretLeaseRenewCmd.Flags().String("token", "", "Renew dynamic secrets machine identity access token")
	dynamicSecretLeaseRenewCmd.Flags().String("projectId", "", "Manually set the projectId to fetch leased from when using machine identity based auth")
	dynamicSecretLeaseRenewCmd.Flags().String("project-slug", "", "Manually set the project-slug to renew lease in")
	dynamicSecretLeaseRenewCmd.Flags().String("ttl", "", "The lease lifetime TTL. If not provided the default TTL of dynamic secret will be used.")
	dynamicSecretLeaseCmd.AddCommand(dynamicSecretLeaseRenewCmd)

	dynamicSecretLeaseRevokeCmd.Flags().StringP("path", "p", "/", "The path from where dynamic secret should be leased from")
	dynamicSecretLeaseRevokeCmd.Flags().String("token", "", "Delete dynamic secrets using machine identity access token")
	dynamicSecretLeaseRevokeCmd.Flags().String("projectId", "", "Manually set the projectId to fetch leased from when using machine identity based auth")
	dynamicSecretLeaseRevokeCmd.Flags().String("project-slug", "", "Manually set the project-slug to revoke lease from")
	dynamicSecretLeaseCmd.AddCommand(dynamicSecretLeaseRevokeCmd)

	dynamicSecretCmd.AddCommand(dynamicSecretLeaseCmd)

	dynamicSecretCmd.Flags().String("token", "", "Fetch secrets using service token or machine identity access token")
	dynamicSecretCmd.Flags().String("projectId", "", "Manually set the projectId to fetch dynamic-secret when using machine identity based auth")
	dynamicSecretCmd.Flags().String("project-slug", "", "Manually set the project-slug to fetch dynamic-secret from")
	dynamicSecretCmd.PersistentFlags().String("env", "dev", "Used to select the environment name on which actions should be taken on")
	dynamicSecretCmd.Flags().String("path", "/", "get dynamic secret within a folder path")
	rootCmd.AddCommand(dynamicSecretCmd)
}
