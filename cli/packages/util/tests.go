package util

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/spf13/cobra"
)

func HandleSendTestSecrets(cmd *cobra.Command, secrets []models.SingleEnvironmentVariable) {
	isTestMode := os.Getenv("TEST_MODE")

	if isTestMode != "true" {
		return
	}

	jsonOut, err := json.Marshal(secrets)
	if err != nil {
		HandleError(err, "Unable to marshal secrets")
	}

	fmt.Fprint(cmd.OutOrStdout(), string(jsonOut))

}
