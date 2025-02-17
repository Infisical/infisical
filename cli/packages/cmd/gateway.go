package cmd

import (
	// "fmt"

	// "github.com/Infisical/infisical-merge/packages/api"
	// "github.com/Infisical/infisical-merge/packages/models"
	"fmt"

	"github.com/Infisical/infisical-merge/packages/gateway"
	"github.com/Infisical/infisical-merge/packages/util"
	// "github.com/Infisical/infisical-merge/packages/visualize"
	// "github.com/rs/zerolog/log"

	// "github.com/go-resty/resty/v2"
	"github.com/posthog/posthog-go"
	"github.com/spf13/cobra"
)

var gatewayCmd = &cobra.Command{
	Example:               `infisical gateway`,
	Short:                 "Used to infisical gateway",
	Use:                   "gateway",
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		token, err := util.GetInfisicalToken(cmd)
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		if token == nil {
			util.HandleError(fmt.Errorf("Token not found"))
		}

		gatewayInstance, err := gateway.NewGateway(token.Token)
		if err != nil {
			util.HandleError(err)
		}

		if err = gatewayInstance.ConnectWithRelay(); err != nil {
			util.HandleError(err)
		}

		if err := gatewayInstance.Listen(); err != nil {
			util.HandleError(err)
		}

		Telemetry.CaptureEvent("cli-command:gateway", posthog.NewProperties().Set("version", util.CLI_VERSION))
	},
}

func init() {
	gatewayCmd.SetHelpFunc(func(command *cobra.Command, strings []string) {
		command.Flags().MarkHidden("domain")
		command.Parent().HelpFunc()(command, strings)
	})
	gatewayCmd.Flags().String("token", "", "Connect with Infisical using machine identity access token")

	rootCmd.AddCommand(gatewayCmd)
}
