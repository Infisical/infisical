/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"strings"
	"time"

	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var tokenCmd = &cobra.Command{
	Use:                   "token",
	Short:                 "Manage your access tokens",
	DisableFlagsInUseLine: true,
	Example:               "infisical token",
	Args:                  cobra.ExactArgs(0),
	PreRun: func(cmd *cobra.Command, args []string) {
		util.RequireLogin()
	},
	Run: func(cmd *cobra.Command, args []string) {
	},
}

var tokenRenewCmd = &cobra.Command{
	Use:                   "renew [token]",
	Short:                 "Used to renew your universal auth access token",
	DisableFlagsInUseLine: true,
	Example:               "infisical token renew <access-token>",
	Args:                  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		// args[0] will be the <INSERT_TOKEN> from your command call
		token := args[0]

		if strings.HasPrefix(token, "st.") {
			util.PrintErrorMessageAndExit("You are trying to renew a service token. You can only renew universal auth access tokens.")
		}

		renewedAccessToken, err := util.RenewMachineIdentityAccessToken(token)

		if err != nil {
			util.HandleError(err, "Unable to renew token")
		}

		boldGreen := color.New(color.FgGreen).Add(color.Bold)
		time.Sleep(time.Second * 1)
		boldGreen.Printf(">>>> Successfully renewed token!\n\n")
		boldGreen.Printf("Renewed Access Token:\n%v", renewedAccessToken)

		plainBold := color.New(color.Bold)
		plainBold.Println("\n\nYou can use the new access token to authenticate through other commands in the CLI.")

	},
}

func init() {
	tokenCmd.AddCommand(tokenRenewCmd)

	rootCmd.AddCommand(tokenCmd)
}
