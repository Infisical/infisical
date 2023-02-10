/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"fmt"
	"os"

	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/spf13/cobra"
)

var resetCmd = &cobra.Command{
	Use:                   "reset",
	Short:                 "Used delete all Infisical related data on your machine",
	DisableFlagsInUseLine: true,
	Example:               "infisical reset",
	Args:                  cobra.NoArgs,
	PreRun: func(cmd *cobra.Command, args []string) {
		toggleDebug(cmd, args)
	},
	Run: func(cmd *cobra.Command, args []string) {
		// delete config
		_, pathToDir, err := util.GetFullConfigFilePath()
		if err != nil {
			util.HandleError(err)
		}

		fmt.Println(pathToDir)

		os.RemoveAll(pathToDir)

		// delete keyring
		keyringInstance, err := util.GetKeyRing()
		if err != nil {
			util.HandleError(err)
		}

		keyringInstance.Remove(util.KEYRING_SERVICE_NAME)

		util.PrintSuccessMessage("Reset successful")
	},
}

func init() {
	rootCmd.AddCommand(resetCmd)
}
