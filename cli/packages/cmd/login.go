/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"context"
	"strings"
	"time"

	"fmt"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/fatih/color"
	"github.com/spf13/cobra"

	infisicalSdk "github.com/infisical/go-sdk"
)

func handleUniversalAuthLogin(cmd *cobra.Command, infisicalClient infisicalSdk.InfisicalClientInterface) (credential infisicalSdk.MachineIdentityCredential, e error) {

	clientId, err := util.GetCmdFlagOrEnv(cmd, "client-id", util.INFISICAL_UNIVERSAL_AUTH_CLIENT_ID_NAME)

	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	clientSecret, err := util.GetCmdFlagOrEnv(cmd, "client-secret", util.INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET_NAME)
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	return infisicalClient.Auth().UniversalAuthLogin(clientId, clientSecret)
}

func handleKubernetesAuthLogin(cmd *cobra.Command, infisicalClient infisicalSdk.InfisicalClientInterface) (credential infisicalSdk.MachineIdentityCredential, e error) {

	identityId, err := util.GetCmdFlagOrEnv(cmd, "machine-identity-id", util.INFISICAL_MACHINE_IDENTITY_ID_NAME)
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	serviceAccountTokenPath, err := util.GetCmdFlagOrEnv(cmd, "service-account-token-path", util.INFISICAL_KUBERNETES_SERVICE_ACCOUNT_TOKEN_NAME)
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	return infisicalClient.Auth().KubernetesAuthLogin(identityId, serviceAccountTokenPath)
}

func handleAzureAuthLogin(cmd *cobra.Command, infisicalClient infisicalSdk.InfisicalClientInterface) (credential infisicalSdk.MachineIdentityCredential, e error) {

	identityId, err := util.GetCmdFlagOrEnv(cmd, "machine-identity-id", util.INFISICAL_MACHINE_IDENTITY_ID_NAME)
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	return infisicalClient.Auth().AzureAuthLogin(identityId, "")
}

func handleGcpIdTokenAuthLogin(cmd *cobra.Command, infisicalClient infisicalSdk.InfisicalClientInterface) (credential infisicalSdk.MachineIdentityCredential, e error) {

	identityId, err := util.GetCmdFlagOrEnv(cmd, "machine-identity-id", util.INFISICAL_MACHINE_IDENTITY_ID_NAME)
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	return infisicalClient.Auth().GcpIdTokenAuthLogin(identityId)
}

func handleGcpIamAuthLogin(cmd *cobra.Command, infisicalClient infisicalSdk.InfisicalClientInterface) (credential infisicalSdk.MachineIdentityCredential, e error) {

	identityId, err := util.GetCmdFlagOrEnv(cmd, "machine-identity-id", util.INFISICAL_MACHINE_IDENTITY_ID_NAME)
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	serviceAccountKeyFilePath, err := util.GetCmdFlagOrEnv(cmd, "service-account-key-file-path", util.INFISICAL_GCP_IAM_SERVICE_ACCOUNT_KEY_FILE_PATH_NAME)
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	return infisicalClient.Auth().GcpIamAuthLogin(identityId, serviceAccountKeyFilePath)
}

func handleAwsIamAuthLogin(cmd *cobra.Command, infisicalClient infisicalSdk.InfisicalClientInterface) (credential infisicalSdk.MachineIdentityCredential, e error) {

	identityId, err := util.GetCmdFlagOrEnv(cmd, "machine-identity-id", util.INFISICAL_MACHINE_IDENTITY_ID_NAME)
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	return infisicalClient.Auth().AwsIamAuthLogin(identityId)
}

func handleOidcAuthLogin(cmd *cobra.Command, infisicalClient infisicalSdk.InfisicalClientInterface) (credential infisicalSdk.MachineIdentityCredential, e error) {

	identityId, err := util.GetCmdFlagOrEnv(cmd, "machine-identity-id", util.INFISICAL_MACHINE_IDENTITY_ID_NAME)
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	jwt, err := util.GetCmdFlagOrEnv(cmd, "oidc-jwt", util.INFISICAL_OIDC_AUTH_JWT_NAME)
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	return infisicalClient.Auth().OidcAuthLogin(identityId, jwt)
}

func formatAuthMethod(authMethod string) string {
	return strings.ReplaceAll(authMethod, "-", " ")
}

// loginCmd represents the login command
var loginCmd = &cobra.Command{
	Use:                   "login",
	Short:                 "Login into your Infisical account",
	DisableFlagsInUseLine: true,
	Run: func(cmd *cobra.Command, args []string) {

		presetDomain := config.INFISICAL_URL

		clearSelfHostedDomains, err := cmd.Flags().GetBool("clear-domains")
		if err != nil {
			util.HandleError(err)
		}

		if clearSelfHostedDomains {
			infisicalConfig, err := util.GetConfigFile()
			if err != nil {
				util.HandleError(err)
			}

			infisicalConfig.Domains = []string{}
			err = util.WriteConfigFile(&infisicalConfig)

			if err != nil {
				util.HandleError(err)
			}

			fmt.Println("Cleared all self-hosted domains from the config file")
			return
		}

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

		loginMethod, err := cmd.Flags().GetString("method")
		if err != nil {
			util.HandleError(err)
		}
		plainOutput, err := cmd.Flags().GetBool("plain")
		if err != nil {
			util.HandleError(err)
		}

		isSilent, err := cmd.Flags().GetBool("silent")
		if err != nil {
			util.HandleError(err)
		}

		authMethodValid, strategy := util.IsAuthMethodValid(loginMethod, true)
		if !authMethodValid {
			util.PrintErrorMessageAndExit(fmt.Sprintf("Invalid login method: %s", loginMethod))
		}

		// standalone user auth
		if loginMethod == "user" {
			util.LoginUser(Telemetry, cmd.Flags().Changed("interactive"), presetDomain, isSilent)
		} else {

			authStrategies := map[util.AuthStrategyType]func(cmd *cobra.Command, infisicalClient infisicalSdk.InfisicalClientInterface) (credential infisicalSdk.MachineIdentityCredential, e error){
				util.AuthStrategy.UNIVERSAL_AUTH:    handleUniversalAuthLogin,
				util.AuthStrategy.KUBERNETES_AUTH:   handleKubernetesAuthLogin,
				util.AuthStrategy.AZURE_AUTH:        handleAzureAuthLogin,
				util.AuthStrategy.GCP_ID_TOKEN_AUTH: handleGcpIdTokenAuthLogin,
				util.AuthStrategy.GCP_IAM_AUTH:      handleGcpIamAuthLogin,
				util.AuthStrategy.AWS_IAM_AUTH:      handleAwsIamAuthLogin,
				util.AuthStrategy.OIDC_AUTH:         handleOidcAuthLogin,
			}

			credential, err := authStrategies[strategy](cmd, infisicalClient)

			if err != nil {
				euErrorMessage := ""
				if strings.HasPrefix(config.INFISICAL_URL, util.INFISICAL_DEFAULT_US_URL) {
					euErrorMessage = fmt.Sprintf("\nIf you are using the Infisical Cloud Europe Region, please switch to it by using the \"--domain %s\" flag.", util.INFISICAL_DEFAULT_EU_URL)
				}
				util.HandleError(fmt.Errorf("unable to authenticate with %s [err=%v].%s", formatAuthMethod(loginMethod), err, euErrorMessage))
			}

			if plainOutput {
				fmt.Println(credential.AccessToken)
				return
			}

			boldGreen := color.New(color.FgGreen).Add(color.Bold)
			boldPlain := color.New(color.Bold)
			time.Sleep(time.Second * 1)
			boldGreen.Printf(">>>> Successfully authenticated with %s!\n\n", formatAuthMethod(loginMethod))
			boldPlain.Printf("Access Token:\n%v", credential.AccessToken)

			plainBold := color.New(color.Bold)
			plainBold.Println("\n\nYou can use this access token to authenticate through other commands in the CLI.")

		}
	},
}

func init() {
	rootCmd.AddCommand(loginCmd)
	loginCmd.Flags().Bool("clear-domains", false, "clear all self-hosting domains from the config file")
	loginCmd.Flags().BoolP("interactive", "i", false, "login via the command line")
	loginCmd.Flags().String("method", "user", "login method [user, universal-auth]")
	loginCmd.Flags().Bool("plain", false, "only output the token without any formatting")
	loginCmd.Flags().String("client-id", "", "client id for universal auth")
	loginCmd.Flags().String("client-secret", "", "client secret for universal auth")
	loginCmd.Flags().String("machine-identity-id", "", "machine identity id for kubernetes, azure, gcp-id-token, gcp-iam, and aws-iam auth methods")
	loginCmd.Flags().String("service-account-token-path", "", "service account token path for kubernetes auth")
	loginCmd.Flags().String("service-account-key-file-path", "", "service account key file path for GCP IAM auth")
	loginCmd.Flags().String("oidc-jwt", "", "JWT for OIDC authentication")
}
