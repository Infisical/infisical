/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"os"

	"github.com/spf13/cobra"

	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/util"
)

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
	rootCmd.Flags().BoolP("toggle", "t", false, "Help message for toggle")
	rootCmd.PersistentFlags().BoolVarP(&debugLogging, "debug", "d", false, "Enable verbose logging")
	rootCmd.PersistentFlags().StringVar(&config.INFISICAL_URL, "domain", util.INFISICAL_DEFAULT_API_URL, "Point the CLI to your own backend [can also set via environment variable name: INFISICAL_API_URL]")
	rootCmd.PersistentPreRun = func(cmd *cobra.Command, args []string) {
		util.CheckForUpdate()
	}

	// if config.INFISICAL_URL is set to the default value, check if INFISICAL_URL is set in the environment
	// this is used to allow overrides of the default value
	if !rootCmd.Flag("domain").Changed {
		if envInfisicalBackendUrl, ok := os.LookupEnv("INFISICAL_API_URL"); ok {
			config.INFISICAL_URL = envInfisicalBackendUrl
		}
	}

}
