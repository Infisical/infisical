package util

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/spf13/cobra"
)

var IS_TEST_MODE = os.Getenv("TEST_MODE") == "true"

func HandleSendTestSecrets(cmd *cobra.Command, secrets []models.SingleEnvironmentVariable) {

	if !IS_TEST_MODE {
		return
	}

	jsonOut, err := json.Marshal(secrets)
	if err != nil {
		HandleError(err, "Unable to marshal secrets")
	}

	fmt.Fprint(cmd.OutOrStdout(), string(jsonOut))
}

func HandleSendTestEnvVars(cmd *cobra.Command, envs []string) {

	if !IS_TEST_MODE {
		return
	}

	stringEnvVars := ""

	for _, env := range envs {
		stringEnvVars += env + "\n"
	}

	fmt.Fprint(cmd.OutOrStdout(), string(stringEnvVars))
}

func HandleSendUniversalAuthToken(cmd *cobra.Command, token string) {

	if !IS_TEST_MODE {
		return
	}

	fmt.Fprint(cmd.OutOrStdout(), token)
}
