package util

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/rs/zerolog/log"
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
}{
	UNIVERSAL_AUTH:    "universal-auth",
	KUBERNETES_AUTH:   "kubernetes",
	AZURE_AUTH:        "azure",
	GCP_ID_TOKEN_AUTH: "gcp-id-token",
	GCP_IAM_AUTH:      "gcp-iam",
	AWS_IAM_AUTH:      "aws-iam",
	OIDC_AUTH:         "oidc-auth",
}

var AVAILABLE_AUTH_STRATEGIES = []AuthStrategyType{
	AuthStrategy.UNIVERSAL_AUTH,
	AuthStrategy.KUBERNETES_AUTH,
	AuthStrategy.AZURE_AUTH,
	AuthStrategy.GCP_ID_TOKEN_AUTH,
	AuthStrategy.GCP_IAM_AUTH,
	AuthStrategy.AWS_IAM_AUTH,
	AuthStrategy.OIDC_AUTH,
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
