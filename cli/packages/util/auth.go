package util

import (
	"fmt"
	"os"
	"os/exec"

	infisicalSdk "github.com/infisical/go-sdk"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
)

type AuthStrategyType string

var AuthStrategy = struct {
	UNIVERSAL_AUTH    AuthStrategyType
	KUBERNETES_AUTH   AuthStrategyType
	AZURE_AUTH        AuthStrategyType
	GCP_ID_TOKEN_AUTH AuthStrategyType
	GCP_IAM_AUTH      AuthStrategyType
	AWS_IAM_AUTH      AuthStrategyType
	OIDC_AUTH         AuthStrategyType
	JWT_AUTH          AuthStrategyType
}{
	UNIVERSAL_AUTH:    "universal-auth",
	KUBERNETES_AUTH:   "kubernetes",
	AZURE_AUTH:        "azure",
	GCP_ID_TOKEN_AUTH: "gcp-id-token",
	GCP_IAM_AUTH:      "gcp-iam",
	AWS_IAM_AUTH:      "aws-iam",
	OIDC_AUTH:         "oidc-auth",
	JWT_AUTH:          "jwt-auth",
}

var AVAILABLE_AUTH_STRATEGIES = []AuthStrategyType{
	AuthStrategy.UNIVERSAL_AUTH,
	AuthStrategy.KUBERNETES_AUTH,
	AuthStrategy.AZURE_AUTH,
	AuthStrategy.GCP_ID_TOKEN_AUTH,
	AuthStrategy.GCP_IAM_AUTH,
	AuthStrategy.AWS_IAM_AUTH,
	AuthStrategy.OIDC_AUTH,
	AuthStrategy.JWT_AUTH,
}

func IsAuthMethodValid(authMethod string, allowUserAuth bool) (isValid bool, strategy AuthStrategyType) {

	if authMethod == "user" && allowUserAuth {
		return true, ""
	}

	for _, strategy := range AVAILABLE_AUTH_STRATEGIES {
		if string(strategy) == authMethod {
			return true, strategy
		}
	}
	return false, ""
}

// EstablishUserLoginSession handles the login flow to either create a new session or restore an expired one.
// It returns fresh user details if login is successful.
func EstablishUserLoginSession() LoggedInUserDetails {
	log.Info().Msg("No valid login session found, triggering login flow")

	exePath, err := os.Executable()
	if err != nil {
		PrintErrorMessageAndExit(fmt.Sprintf("Failed to determine executable path: %v", err))
	}

	// Spawn infisical login command
	loginCmd := exec.Command(exePath, "login", "--silent")
	loginCmd.Stdin = os.Stdin
	loginCmd.Stdout = os.Stdout
	loginCmd.Stderr = os.Stderr

	err = loginCmd.Run()
	if err != nil {
		PrintErrorMessageAndExit(fmt.Sprintf("Failed to automatically trigger login flow. Please run [infisical login] manually to login."))
	}

	loggedInUserDetails, err := GetCurrentLoggedInUserDetails(true)
	if err != nil {
		PrintErrorMessageAndExit("You must be logged in to run this command. To login, run [infisical login]")
	}

	if loggedInUserDetails.LoginExpired {
		PrintErrorMessageAndExit("Your login session has expired. Please run [infisical login]")
	}

	return loggedInUserDetails
}

type SdkAuthenticator struct {
	infisicalClient infisicalSdk.InfisicalClientInterface
	cmd             *cobra.Command
}

func NewSdkAuthenticator(infisicalClient infisicalSdk.InfisicalClientInterface, cmd *cobra.Command) *SdkAuthenticator {
	return &SdkAuthenticator{
		infisicalClient: infisicalClient,
		cmd:             cmd,
	}
}
func (a *SdkAuthenticator) HandleUniversalAuthLogin() (credential infisicalSdk.MachineIdentityCredential, e error) {

	clientId, err := GetCmdFlagOrEnv(a.cmd, "client-id", []string{INFISICAL_UNIVERSAL_AUTH_CLIENT_ID_NAME})

	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	clientSecret, err := GetCmdFlagOrEnv(a.cmd, "client-secret", []string{INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET_NAME})
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	return a.infisicalClient.Auth().UniversalAuthLogin(clientId, clientSecret)
}

func (a *SdkAuthenticator) HandleJwtAuthLogin() (credential infisicalSdk.MachineIdentityCredential, e error) {

	identityId, err := GetCmdFlagOrEnv(a.cmd, "machine-identity-id", []string{INFISICAL_MACHINE_IDENTITY_ID_NAME})
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	jwt, err := GetCmdFlagOrEnv(a.cmd, "jwt", []string{INFISICAL_JWT_NAME})
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	return a.infisicalClient.Auth().JwtAuthLogin(identityId, jwt)
}

func (a *SdkAuthenticator) HandleKubernetesAuthLogin() (credential infisicalSdk.MachineIdentityCredential, e error) {

	identityId, err := GetCmdFlagOrEnv(a.cmd, "machine-identity-id", []string{INFISICAL_MACHINE_IDENTITY_ID_NAME})
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	serviceAccountTokenPath, err := GetCmdFlagOrEnv(a.cmd, "service-account-token-path", []string{INFISICAL_KUBERNETES_SERVICE_ACCOUNT_TOKEN_NAME})
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	return a.infisicalClient.Auth().KubernetesAuthLogin(identityId, serviceAccountTokenPath)
}

func (a *SdkAuthenticator) HandleAzureAuthLogin() (credential infisicalSdk.MachineIdentityCredential, e error) {

	identityId, err := GetCmdFlagOrEnv(a.cmd, "machine-identity-id", []string{INFISICAL_MACHINE_IDENTITY_ID_NAME})
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	return a.infisicalClient.Auth().AzureAuthLogin(identityId, "")
}

func (a *SdkAuthenticator) HandleGcpIdTokenAuthLogin() (credential infisicalSdk.MachineIdentityCredential, e error) {

	identityId, err := GetCmdFlagOrEnv(a.cmd, "machine-identity-id", []string{INFISICAL_MACHINE_IDENTITY_ID_NAME})
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	return a.infisicalClient.Auth().GcpIdTokenAuthLogin(identityId)
}

func (a *SdkAuthenticator) HandleGcpIamAuthLogin() (credential infisicalSdk.MachineIdentityCredential, e error) {

	identityId, err := GetCmdFlagOrEnv(a.cmd, "machine-identity-id", []string{INFISICAL_MACHINE_IDENTITY_ID_NAME})
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	serviceAccountKeyFilePath, err := GetCmdFlagOrEnv(a.cmd, "service-account-key-file-path", []string{INFISICAL_GCP_IAM_SERVICE_ACCOUNT_KEY_FILE_PATH_NAME})
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	return a.infisicalClient.Auth().GcpIamAuthLogin(identityId, serviceAccountKeyFilePath)
}

func (a *SdkAuthenticator) HandleAwsIamAuthLogin() (credential infisicalSdk.MachineIdentityCredential, e error) {

	identityId, err := GetCmdFlagOrEnv(a.cmd, "machine-identity-id", []string{INFISICAL_MACHINE_IDENTITY_ID_NAME})
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	return a.infisicalClient.Auth().AwsIamAuthLogin(identityId)
}

func (a *SdkAuthenticator) HandleOidcAuthLogin() (credential infisicalSdk.MachineIdentityCredential, e error) {

	identityId, err := GetCmdFlagOrEnv(a.cmd, "machine-identity-id", []string{INFISICAL_MACHINE_IDENTITY_ID_NAME})
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	jwt, err := GetCmdFlagOrEnv(a.cmd, "jwt", []string{INFISICAL_JWT_NAME, INFISICAL_OIDC_AUTH_JWT_NAME})
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, err
	}

	return a.infisicalClient.Auth().OidcAuthLogin(identityId, jwt)
}
