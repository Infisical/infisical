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

			// If we get a second signal, force exit
			<-sigCh
			log.Warn().Msgf("Force exit triggered")
			os.Exit(1)
		}()

		// Main gateway retry loop with proper context handling
		retryTicker := time.NewTicker(5 * time.Second)
		defer retryTicker.Stop()

		for {
			if ctx.Err() != nil {
				log.Info().Msg("Shutting down gateway")
				return
			}
			gatewayInstance, err := gateway.NewGateway(token.Token)
			if err != nil {
				util.HandleError(err)
			}

			if err = gatewayInstance.ConnectWithRelay(); err != nil {
				if ctx.Err() != nil {
					log.Info().Msg("Shutting down gateway")
					return
				}

				log.Error().Msgf("Gateway connection error with relay: %s", err)
				log.Info().Msg("Retrying connection in 5 seconds...")
				select {
				case <-retryTicker.C:
					continue
				case <-ctx.Done():
					log.Info().Msg("Shutting down gateway")
					return
				}
			}

			err = gatewayInstance.Listen(ctx)
			if ctx.Err() != nil {
				log.Info().Msg("Gateway shutdown complete")
				return
			}
			log.Error().Msgf("Gateway listen error: %s", err)
			log.Info().Msg("Retrying connection in 5 seconds...")
			select {
			case <-retryTicker.C:
				continue
			case <-ctx.Done():
				log.Info().Msg("Shutting down gateway")
				return
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
