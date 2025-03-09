package cmd

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"github.com/Infisical/infisical-merge/packages/gateway"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/rs/zerolog/log"
	"github.com/posthog/posthog-go"
	"github.com/spf13/cobra"
)

const systemdServiceTemplate = `[Unit]
Description=Infisical Gateway Service
After=network.target

[Service]
Type=simple
EnvironmentFile=/etc/infisical/gateway.conf
ExecStart=/usr/local/bin/infisical gateway
Restart=on-failure
InaccessibleDirectories=/home
PrivateTmp=yes
LimitCORE=infinity
LimitNOFILE=1000000
LimitNPROC=60000
LimitRTPRIO=infinity
LimitRTTIME=7000000

[Install]
WantedBy=multi-user.target
`

func installSystemdService(token string, domain string) error {
	if runtime.GOOS != "linux" {
		log.Info().Msg("Skipping systemd service installation - not on Linux")
		return nil
	}

	if os.Geteuid() != 0 {
		log.Info().Msg("Skipping systemd service installation - not running as root/sudo")
		return nil
	}

	configDir := "/etc/infisical"
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %v", err)
	}

	configContent := fmt.Sprintf("INFISICAL_UNIVERSAL_AUTH_ACCESS_TOKEN=%s\n", token)
	if domain != "" {
		configContent += fmt.Sprintf("INFISICAL_API_URL=%s\n", domain)
	} else {
		configContent += "INFISICAL_API_URL=\n"
	}

	configPath := filepath.Join(configDir, "gateway.conf")
	if err := os.WriteFile(configPath, []byte(configContent), 0600); err != nil {
		return fmt.Errorf("failed to write config file: %v", err)
	}

	servicePath := "/etc/systemd/system/infisical-gateway.service"
	if _, err := os.Stat(servicePath); err == nil {
		log.Info().Msg("Systemd service file already exists")
		return nil
	}

	if err := os.WriteFile(servicePath, []byte(systemdServiceTemplate), 0644); err != nil {
		return fmt.Errorf("failed to write systemd service file: %v", err)
	}

	reloadCmd := exec.Command("systemctl", "daemon-reload")
	if err := reloadCmd.Run(); err != nil {
		return fmt.Errorf("failed to reload systemd: %v", err)
	}

	log.Info().Msg("Successfully installed systemd service")
	log.Info().Msg("To start the service, run: sudo systemctl start infisical-gateway")
	log.Info().Msg("To enable the service on boot, run: sudo systemctl enable infisical-gateway")

	return nil
}

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

		domain, err := cmd.Flags().GetString("domain")
		if err != nil {
			util.HandleError(err, "Unable to parse domain flag")
		}

		// Try to install systemd service if possible
		if err := installSystemdService(token.Token, domain); err != nil {
			log.Warn().Msgf("Failed to install systemd service: %v", err)
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

	gatewayRelayCmd.Flags().String("config", "", "Relay config yaml file path")

	gatewayCmd.AddCommand(gatewayRelayCmd)
	rootCmd.AddCommand(gatewayCmd)
}
