/*
Copyright © 2022 NAME HERE <EMAIL ADDRESS>
*/
package cmd

import (
	"github.com/99designs/keyring"
	"github.com/Infisical/infisical-merge/packages/util"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var vaultSetCmd = &cobra.Command{
	Example:               `infisical vault set pass`,
	Use:                   "set [vault-name]",
	Short:                 "Used to set the vault backend to store your login details securely at rest",
	DisableFlagsInUseLine: true,
	PreRun:                toggleDebug,
	Args:                  cobra.MinimumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		wantedVaultTypeName := args[0]
		currentVaultBackend, err := util.GetCurrentVaultBackend()
		if err != nil {
			log.Errorf("Unable to set vault to [%s] because of [err=%s]", wantedVaultTypeName, err)
			return
		}

		if wantedVaultTypeName == string(currentVaultBackend) {
			log.Errorf("You are already on vault backend [%s]", currentVaultBackend)
			return
		}

		if isVaultToSwitchToValid(wantedVaultTypeName) {
			configFile, err := util.GetConfigFile()
			if err != nil {
				log.Errorf("Unable to set vault to [%s] because of [err=%s]", wantedVaultTypeName, err)
				return
			}

			configFile.VaultBackendType = keyring.BackendType(wantedVaultTypeName) // save selected vault
			configFile.LoggedInUserEmail = ""                                      // reset the logged in user to prompt them to re login

			err = util.WriteConfigFile(&configFile)
			if err != nil {
				log.Errorf("Unable to set vault to [%s] because an error occurred when saving the config file [err=%s]")
				return
			}

			log.Infof("Successfully, switched vault backend from [%s] to [%s]. Please login in again to store your login details in the new vault with [infisical login]", currentVaultBackend, wantedVaultTypeName)
		} else {
			log.Errorf("The requested vault type [%s] is not available on this system. Only the following vault backends are available for you system: %s", wantedVaultTypeName, keyring.AvailableBackends())
		}
	},
}

// runCmd represents the run command
var vaultCmd = &cobra.Command{
	Use:                   "vault",
	Short:                 "Used to manage where your Infisical login token is saved on your machine",
	DisableFlagsInUseLine: true,
	PreRun:                toggleDebug,
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		printAvailableVaultBackends()
	},
}

func printAvailableVaultBackends() {
	log.Infof("The following vaults are available on your system:")
	for _, backend := range keyring.AvailableBackends() {
		log.Infof("- %s", backend)
	}

	currentVaultBackend, err := util.GetCurrentVaultBackend()
	if err != nil {
		log.Errorf("printAvailableVaultBackends: unable to print the available vault backend because of error [err=%s]", err)
	}

	log.Infof("\nYou are currently using [%s] vault to store your login credentials", string(currentVaultBackend))
}

// Checks if the vault that the user wants to switch to is a valid available vault
func isVaultToSwitchToValid(vaultNameToSwitchTo string) bool {
	isFound := false
	for _, backend := range keyring.AvailableBackends() {
		if vaultNameToSwitchTo == string(backend) {
			isFound = true
			break
		}
	}

	return isFound
}

func init() {
	vaultCmd.AddCommand(vaultSetCmd)
	rootCmd.AddCommand(vaultCmd)
}
