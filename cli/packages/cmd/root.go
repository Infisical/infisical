/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/telemetry"
	"github.com/Infisical/infisical-merge/packages/util"
)

var Telemetry *telemetry.Telemetry

var rootCmd = &cobra.Command{
	Use:               "infisical",
	Short:             "Infisical CLI is used to inject environment variables into any process",
	Long:              `Infisical is a simple, end-to-end encrypted service that enables teams to sync and manage their environment variables across their development life cycle.`,
	CompletionOptions: cobra.CompletionOptions{HiddenDefaultCmd: true},
	Version:           util.CLI_VERSION,
}

// Execute adds all child commands to the root command and sets flags appropriately.
// This is called by main.main(). It only needs to happen once to the rootCmd.
func Execute() {
	err := rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}
}

func init() {
	cobra.OnInitialize(initLog)
	rootCmd.PersistentFlags().StringP("log-level", "l", "info", "log level (trace, debug, info, warn, error, fatal)")
	rootCmd.PersistentFlags().Bool("telemetry", true, "Infisical collects non-sensitive telemetry data to enhance features and improve user experience. Participation is voluntary")
	rootCmd.PersistentFlags().StringVar(&config.INFISICAL_URL, "domain", util.INFISICAL_DEFAULT_API_URL, "Point the CLI to your own backend [can also set via environment variable name: INFISICAL_API_URL]")
	rootCmd.PersistentFlags().Bool("silent", false, "Disable output of tip/info messages. Useful when running in scripts or CI/CD pipelines.")
	rootCmd.PersistentPreRun = func(cmd *cobra.Command, args []string) {
		silent, err := cmd.Flags().GetBool("silent")
		if err != nil {
			util.HandleError(err)
		}

		config.INFISICAL_URL = util.AppendAPIEndpoint(config.INFISICAL_URL)

		if !util.IsRunningInDocker() && !silent {
			util.CheckForUpdate()
		}

		loggedInDetails, err := util.GetCurrentLoggedInUserDetails()

		if !silent && err == nil && loggedInDetails.IsUserLoggedIn && !loggedInDetails.LoginExpired {
			token, err := util.GetInfisicalToken(cmd)

			if err == nil && token != nil {
				util.PrintWarning(fmt.Sprintf("Your logged-in session is being overwritten by the token provided from the %s.", token.Source))
			}
		}

	}

	// if config.INFISICAL_URL is set to the default value, check if INFISICAL_URL is set in the environment
	// this is used to allow overrides of the default value
	if !rootCmd.Flag("domain").Changed {
		if envInfisicalBackendUrl, ok := os.LookupEnv("INFISICAL_API_URL"); ok {
			config.INFISICAL_URL = envInfisicalBackendUrl
		}
	}

	isTelemetryOn, _ := rootCmd.PersistentFlags().GetBool("telemetry")
	Telemetry = telemetry.NewTelemetry(isTelemetryOn)
}

func initLog() {
	zerolog.SetGlobalLevel(zerolog.InfoLevel)
	ll, err := rootCmd.Flags().GetString("log-level")
	if err != nil {
		log.Fatal().Msg(err.Error())
	}
	switch strings.ToLower(ll) {
	case "trace":
		zerolog.SetGlobalLevel(zerolog.TraceLevel)
	case "debug":
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	case "info":
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	case "warn":
		zerolog.SetGlobalLevel(zerolog.WarnLevel)
	case "err", "error":
		zerolog.SetGlobalLevel(zerolog.ErrorLevel)
	case "fatal":
		zerolog.SetGlobalLevel(zerolog.FatalLevel)
	default:
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	}
}
