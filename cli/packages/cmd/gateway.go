package cmd

import (
	// "fmt"

	// "github.com/Infisical/infisical-merge/packages/api"
	// "github.com/Infisical/infisical-merge/packages/models"
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Infisical/infisical-merge/packages/gateway"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/rs/zerolog/log"

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

		Telemetry.CaptureEvent("cli-command:gateway", posthog.NewProperties().Set("version", util.CLI_VERSION))

		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sigStopCh := make(chan bool, 1)

		ctx, cancel := context.WithCancel(cmd.Context())
		defer cancel()

		go func() {
			<-sigCh
			close(sigStopCh)
			cancel()
		}()

		for {
			select {
			case <-sigStopCh:
				log.Info().Msg("Shutting down gateway")
				return
			default:
				gatewayInstance, err := gateway.NewGateway(token.Token)
				if err != nil {
					util.HandleError(err)
				}

				if err = gatewayInstance.ConnectWithRelay(); err != nil {
					log.Error().Msgf("Gateway connection error with relay: %s", err)
					log.Info().Msg("Restarting gateway...")
					time.Sleep(5 * time.Second)
					continue
				}
				err = gatewayInstance.Listen(ctx)
				if err == nil {
					// meaning everything went smooth and we are exiting
					return
				}

				log.Error().Msgf("Gateway listen error: %s", err)
				log.Info().Msg("Restarting gateway...")
				time.Sleep(5 * time.Second)
			}
		}
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
