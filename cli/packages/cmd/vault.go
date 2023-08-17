/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"fmt"
	"strings"

	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/posthog/posthog-go"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
)

var AvailableVaultsAndDescriptions = []string{"auto (automatically select native vault on system)", "file (encrypted file vault)"}
var AvailableVaults = []string{"auto", "file"}

var vaultSetCmd = &cobra.Command{
	Example:               `infisical vault set pass`,
	Use:                   "set [vault-name]",
	Short:                 "Used to set the vault backend to store your login details securely at rest",
	DisableFlagsInUseLine: true,
	Args:                  cobra.MinimumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		wantedVaultTypeName := args[0]
		currentVaultBackend, err := util.GetCurrentVaultBackend()
		if err != nil {
			log.Error().Msgf("Unable to set vault to [%s] because of [err=%s]", wantedVaultTypeName, err)
			return
		}

		if wantedVaultTypeName == string(currentVaultBackend) {
			log.Error().Msgf("You are already on vault backend [%s]", currentVaultBackend)
			return
		}

		if wantedVaultTypeName == "auto" || wantedVaultTypeName == "file" {
			configFile, err := util.GetConfigFile()
			if err != nil {
				log.Error().Msgf("Unable to set vault to [%s] because of [err=%s]", wantedVaultTypeName, err)
				return
			}

			configFile.VaultBackendType = wantedVaultTypeName // save selected vault
			configFile.LoggedInUserEmail = ""                 // reset the logged in user to prompt them to re login

			err = util.WriteConfigFile(&configFile)
			if err != nil {
				log.Error().Msgf("Unable to set vault to [%s] because an error occurred when saving the config file [err=%s]", wantedVaultTypeName, err)
				return
			}

			fmt.Printf("\nSuccessfully, switched vault backend from [%s] to [%s]. Please login in again to store your login details in the new vault with [infisical login]\n", currentVaultBackend, wantedVaultTypeName)

			Telemetry.CaptureEvent("cli-command:vault set", posthog.NewProperties().Set("currentVault", currentVaultBackend).Set("wantedVault", wantedVaultTypeName).Set("version", util.CLI_VERSION))
		} else {
			log.Error().Msgf("The requested vault type [%s] is not available on this system. Only the following vault backends are available for you system: %s", wantedVaultTypeName, strings.Join(AvailableVaults, ", "))
		}
	},
}

// runCmd represents the run command
var vaultCmd = &cobra.Command{
	Use:                   "vault",
	Short:                 "Used to manage where your Infisical login token is saved on your machine",
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		printAvailableVaultBackends()
	},
}

func printAvailableVaultBackends() {
	fmt.Printf("Vaults are used to securely store your login details locally. Available vaults:")
	for _, backend := range AvailableVaultsAndDescriptions {
		fmt.Printf("\n- %s", backend)
	}

	currentVaultBackend, err := util.GetCurrentVaultBackend()
	if err != nil {
		log.Error().Msgf("printAvailableVaultBackends: unable to print the available vault backend because of error [err=%s]", err)
	}

	Telemetry.CaptureEvent("cli-command:vault", posthog.NewProperties().Set("currentVault", currentVaultBackend).Set("version", util.CLI_VERSION))

	fmt.Printf("\n\nYou are currently using [%s] vault to store your login credentials\n", string(currentVaultBackend))
}

func init() {
	vaultCmd.AddCommand(vaultSetCmd)
	rootCmd.AddCommand(vaultCmd)
}
