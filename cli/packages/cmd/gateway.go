package cmd

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/gateway"
	"github.com/Infisical/infisical-merge/packages/util"
	infisicalSdk "github.com/infisical/go-sdk"
	"github.com/pkg/errors"
	"github.com/posthog/posthog-go"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
)

func getInfisicalSdkInstance(cmd *cobra.Command) (infisicalSdk.InfisicalClientInterface, context.CancelFunc, error) {

	ctx, cancel := context.WithCancel(cmd.Context())
	infisicalClient := infisicalSdk.NewInfisicalClient(ctx, infisicalSdk.Config{
		SiteUrl:   config.INFISICAL_URL,
		UserAgent: api.USER_AGENT,
	})

	token, err := util.GetInfisicalToken(cmd)
	if err != nil {
		cancel()
		return nil, nil, err
	}

	// if the --token param is set, we use it directly for authentication
	if token != nil {
		infisicalClient.Auth().SetAccessToken(token.Token)
		return infisicalClient, cancel, nil
	}

	// if the --token param is not set, we use the auth-method flag to determine the authentication method, and perform the appropriate login flow based on that
	authMethod, err := util.GetCmdFlagOrEnv(cmd, "auth-method", []string{util.INFISICAL_AUTH_METHOD_NAME})

	if err != nil {
		cancel()
		return nil, nil, err
	}

	authMethodValid, strategy := util.IsAuthMethodValid(authMethod, false)
	if !authMethodValid {
		util.PrintErrorMessageAndExit(fmt.Sprintf("Invalid login method: %s", authMethod))
	}

	sdkAuthenticator := util.NewSdkAuthenticator(infisicalClient, cmd)

	authStrategies := map[util.AuthStrategyType]func() (credential infisicalSdk.MachineIdentityCredential, e error){
		util.AuthStrategy.UNIVERSAL_AUTH:    sdkAuthenticator.HandleUniversalAuthLogin,
		util.AuthStrategy.KUBERNETES_AUTH:   sdkAuthenticator.HandleKubernetesAuthLogin,
		util.AuthStrategy.AZURE_AUTH:        sdkAuthenticator.HandleAzureAuthLogin,
		util.AuthStrategy.GCP_ID_TOKEN_AUTH: sdkAuthenticator.HandleGcpIdTokenAuthLogin,
		util.AuthStrategy.GCP_IAM_AUTH:      sdkAuthenticator.HandleGcpIamAuthLogin,
		util.AuthStrategy.AWS_IAM_AUTH:      sdkAuthenticator.HandleAwsIamAuthLogin,
		util.AuthStrategy.OIDC_AUTH:         sdkAuthenticator.HandleOidcAuthLogin,
		util.AuthStrategy.JWT_AUTH:          sdkAuthenticator.HandleJwtAuthLogin,
	}

	_, err = authStrategies[strategy]()

	if err != nil {
		cancel()
		return nil, nil, err
	}

	return infisicalClient, cancel, nil
}

var gatewayCmd = &cobra.Command{
	Use:   "gateway",
	Short: "Run the Infisical gateway or manage its systemd service",
	Long:  "Run the Infisical gateway in the foreground or manage its systemd service installation. Use 'gateway install' to set up the systemd service.",
	Example: `infisical gateway --token=<token>
  sudo infisical gateway install --token=<token> --domain=<domain>`,
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {

		infisicalClient, cancelSdk, err := getInfisicalSdkInstance(cmd)
		if err != nil {
			util.HandleError(err, "unable to get infisical client")
		}
		defer cancelSdk()

		var accessToken atomic.Value
		accessToken.Store(infisicalClient.Auth().GetAccessToken())

		if accessToken.Load().(string) == "" {
			util.HandleError(errors.New("no access token found"))
		}

		Telemetry.CaptureEvent("cli-command:gateway", posthog.NewProperties().Set("version", util.CLI_VERSION))

		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sigStopCh := make(chan bool, 1)

		ctx, cancelCmd := context.WithCancel(cmd.Context())
		defer cancelCmd()

		go func() {
			<-sigCh
			close(sigStopCh)
			cancelCmd()
			cancelSdk()

			// If we get a second signal, force exit
			<-sigCh
			log.Warn().Msgf("Force exit triggered")
			os.Exit(1)
		}()

		var gatewayInstance *gateway.Gateway

		// Token refresh goroutine - runs every 10 seconds
		go func() {
			tokenRefreshTicker := time.NewTicker(10 * time.Second)
			defer tokenRefreshTicker.Stop()

			for {
				select {
				case <-tokenRefreshTicker.C:
					if ctx.Err() != nil {
						return
					}

					newToken := infisicalClient.Auth().GetAccessToken()
					if newToken != "" && newToken != accessToken.Load().(string) {
						accessToken.Store(newToken)
						if gatewayInstance != nil {
							gatewayInstance.UpdateIdentityAccessToken(newToken)
						}
					}

				case <-ctx.Done():
					return
				}
			}
		}()

		// Main gateway retry loop with proper context handling
		retryTicker := time.NewTicker(5 * time.Second)
		defer retryTicker.Stop()

		for {
			if ctx.Err() != nil {
				log.Info().Msg("Shutting down gateway")
				return
			}
			gatewayInstance, err := gateway.NewGateway(accessToken.Load().(string))
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
			util.HandleError(errors.New("Token not found"))
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
			util.HandleError(errors.New("Missing config file"))
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
	gatewayCmd.Flags().String("token", "", "connect with Infisical using machine identity access token. if not provided, you must set the auth-method flag")

	gatewayCmd.Flags().String("auth-method", "", "login method [universal-auth, kubernetes, azure, gcp-id-token, gcp-iam, aws-iam, oidc-auth]. if not provided, you must set the token flag")

	gatewayCmd.Flags().String("client-id", "", "client id for universal auth")
	gatewayCmd.Flags().String("client-secret", "", "client secret for universal auth")

	gatewayCmd.Flags().String("machine-identity-id", "", "machine identity id for kubernetes, azure, gcp-id-token, gcp-iam, and aws-iam auth methods")
	gatewayCmd.Flags().String("service-account-token-path", "", "service account token path for kubernetes auth")
	gatewayCmd.Flags().String("service-account-key-file-path", "", "service account key file path for GCP IAM auth")

	gatewayCmd.Flags().String("jwt", "", "JWT for jwt-based auth methods [oidc-auth, jwt-auth]")

	gatewayInstallCmd.Flags().String("token", "", "Connect with Infisical using machine identity access token")
	gatewayInstallCmd.Flags().String("domain", "", "Domain of your self-hosted Infisical instance")

	gatewayRelayCmd.Flags().String("config", "", "Relay config yaml file path")

	gatewayCmd.AddCommand(gatewayInstallCmd)
	gatewayCmd.AddCommand(gatewayUninstallCmd)
	gatewayCmd.AddCommand(gatewayRelayCmd)
	rootCmd.AddCommand(gatewayCmd)
}
