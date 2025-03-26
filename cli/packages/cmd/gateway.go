package cmd

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/Infisical/infisical-merge/packages/gateway"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/posthog/posthog-go"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
)

var gatewayCmd = &cobra.Command{
	Use:   "gateway",
	Short: "Run the Infisical gateway or manage its systemd service",
	Long:  "Run the Infisical gateway in the foreground or manage its systemd service installation. Use 'gateway install' to set up the systemd service.",
	Example: `infisical gateway --token=<token>
  sudo infisical gateway install --token=<token> --domain=<domain>`,
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		token, err := util.GetInfisicalToken(cmd)
		if err != nil {
			util.HandleError(err, "Unable to parse token flag")
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

var gatewayInstallCmd = &cobra.Command{
	Use:                   "install",
	Short:                 "Install and enable systemd service for the gateway (requires sudo)",
	Long:                  "Install and enable systemd service for the gateway. Must be run with sudo on Linux.",
	Example:               "sudo infisical gateway install --token=<token> --domain=<domain>",
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		if runtime.GOOS != "linux" {
			util.HandleError(fmt.Errorf("systemd service installation is only supported on Linux"))
		}

		if os.Geteuid() != 0 {
			util.HandleError(fmt.Errorf("systemd service installation requires root/sudo privileges"))
		}

		token, err := util.GetInfisicalToken(cmd)
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		if token == nil {
			util.HandleError(fmt.Errorf("Token not found"))
		}

		domain, err := cmd.Flags().GetString("domain")
		if err != nil {
			util.HandleError(err, "Unable to parse domain flag")
		}

		if err := gateway.InstallGatewaySystemdService(token.Token, domain); err != nil {
			util.HandleError(err, "Failed to install systemd service")
		}

		enableCmd := exec.Command("systemctl", "enable", "infisical-gateway")
		if err := enableCmd.Run(); err != nil {
			util.HandleError(err, "Failed to enable systemd service")
		}

		log.Info().Msg("Successfully installed and enabled infisical-gateway service")
		log.Info().Msg("To start the service, run: sudo systemctl start infisical-gateway")
	},
}

var gatewayUninstallCmd = &cobra.Command{
	Use:                   "uninstall",
	Short:                 "Uninstall and remove systemd service for the gateway (requires sudo)",
	Long:                  "Uninstall and remove systemd service for the gateway. Must be run with sudo on Linux.",
	Example:               "sudo infisical gateway uninstall",
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		if runtime.GOOS != "linux" {
			util.HandleError(fmt.Errorf("systemd service installation is only supported on Linux"))
		}

		if os.Geteuid() != 0 {
			util.HandleError(fmt.Errorf("systemd service installation requires root/sudo privileges"))
		}

		if err := gateway.UninstallGatewaySystemdService(); err != nil {
			util.HandleError(err, "Failed to uninstall systemd service")
		}
	},
}

var gatewayRelayCmd = &cobra.Command{
	Example:               `infisical gateway relay`,
	Short:                 "Used to run infisical gateway relay",
	Use:                   "relay",
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		relayConfigFilePath, err := cmd.Flags().GetString("config")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		if relayConfigFilePath == "" {
			util.HandleError(fmt.Errorf("Missing config file"))
		}

		gatewayRelay, err := gateway.NewGatewayRelay(relayConfigFilePath)
		if err != nil {
			util.HandleError(err, "Failed to initialize gateway")
		}
		err = gatewayRelay.Run()
		if err != nil {
			util.HandleError(err, "Failed to start gateway")
		}
	},
}

func init() {
	gatewayCmd.Flags().String("token", "", "Connect with Infisical using machine identity access token")
	gatewayInstallCmd.Flags().String("token", "", "Connect with Infisical using machine identity access token")
	gatewayInstallCmd.Flags().String("domain", "", "Domain of your self-hosted Infisical instance")

	gatewayRelayCmd.Flags().String("config", "", "Relay config yaml file path")

	gatewayCmd.AddCommand(gatewayInstallCmd)
	gatewayCmd.AddCommand(gatewayUninstallCmd)
	gatewayCmd.AddCommand(gatewayRelayCmd)
	rootCmd.AddCommand(gatewayCmd)
}
