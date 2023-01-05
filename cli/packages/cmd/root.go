/*
Copyright © 2022 NAME HERE <EMAIL ADDRESS>
*/
package cmd

import (
	"os"

	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:               "infisical",
	Short:             "Infisical CLI is used to inject environment variables into any process",
	Long:              `Infisical is a simple, end-to-end encrypted service that enables teams to sync and manage their environment variables across their development life cycle.`,
	CompletionOptions: cobra.CompletionOptions{HiddenDefaultCmd: true},
	Version:           "0.1.16",
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
	rootCmd.PersistentFlags().StringVar(&config.INFISICAL_URL, "domain", "http://localhost:8080/api", "Point the CLI to your own backend")
	// rootCmd.PersistentPreRun = func(cmd *cobra.Command, args []string) {
	// }
}
