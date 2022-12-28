/*
Copyright © 2022 NAME HERE <EMAIL ADDRESS>
*/
package cmd

import (
	"fmt"

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/Infisical/infisical-merge/packages/visualize"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var secretsCmd = &cobra.Command{
	Example:               `infisical secrets"`,
	Short:                 "Used to create, read update and delete secrets",
	Use:                   "secrets",
	DisableFlagsInUseLine: true,
	PreRun:                toggleDebug,
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {

		secrets, err := util.GetAllEnvironmentVariables("", "dev")
		secrets = util.SubstituteSecrets(secrets)
		if err != nil {
			log.Debugln(err)
			return
		}
		visualize.PrintAllSecretDetails(secrets)
	},
}

var secretsGetCmd = &cobra.Command{
	Example:               `secrets get <secret name A> <secret name B>..."`,
	Short:                 "Used to retrieve secrets by name",
	Use:                   "get [secrets]",
	DisableFlagsInUseLine: true,
	Args:                  cobra.MinimumNArgs(1),
	PreRun:                toggleDebug,
	Run:                   getSecretsByNames,
}

var secretsSetCmd = &cobra.Command{
	Example:               `secrets set <secret name A> <secret value A> <secret name B> <secret value B>..."`,
	Short:                 "Used update retrieve secrets by name",
	Use:                   "set [secrets]",
	DisableFlagsInUseLine: true,
	PreRun:                toggleDebug,
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("set secret")
	},
}

var secretsDeleteCmd = &cobra.Command{
	Example:               `secrets delete <secret name A> <secret name B>..."`,
	Short:                 "Used to delete secrets by name",
	Use:                   "delete [secrets]",
	DisableFlagsInUseLine: true,
	PreRun:                toggleDebug,
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Delete secret")
	},
}

func init() {
	secretsCmd.AddCommand(secretsGetCmd)
	secretsCmd.AddCommand(secretsSetCmd)
	secretsCmd.AddCommand(secretsDeleteCmd)
	rootCmd.AddCommand(secretsCmd)
}

func getSecretsByNames(cmd *cobra.Command, args []string) {
	secrets, err := util.GetAllEnvironmentVariables("", "dev")
	if err != nil {
		log.Error("Unable to retrieve secrets. Run with -d to see full logs")
		log.Debug(err)
	}

	requestedSecrets := []models.SingleEnvironmentVariable{}

	secretsMap := make(map[string]models.SingleEnvironmentVariable)
	for _, secret := range secrets {
		secretsMap[secret.Key] = secret
	}

	for _, secretKeyFromArg := range args {
		if value, ok := secretsMap[secretKeyFromArg]; ok {
			requestedSecrets = append(requestedSecrets, value)
		} else {
			requestedSecrets = append(requestedSecrets, models.SingleEnvironmentVariable{
				Key:   secretKeyFromArg,
				Type:  "NOT FOUND",
				Value: "NOT FOUND",
			})
		}
	}

	visualize.PrintAllSecretDetails(requestedSecrets)
}
