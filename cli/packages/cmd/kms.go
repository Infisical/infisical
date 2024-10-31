/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"fmt"
	"strings"
	"time"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/fatih/color"
	"github.com/go-resty/resty/v2"
	"github.com/spf13/cobra"
)

var kmsCmd = &cobra.Command{
	Use:                   "kms",
	Short:                 "Manage your Infisical KMS encryption keys",
	DisableFlagsInUseLine: true,
	Example:               "infisical kms",
	Args:                  cobra.ExactArgs(0),
	PreRun: func(cmd *cobra.Command, args []string) {
		util.RequireLogin()
	},
	Run: func(cmd *cobra.Command, args []string) {
	},
}

// exportCmd represents the export command
var exportKeyCmd = &cobra.Command{
	Use:                   "export",
	Short:                 "Used to export your Infisical root encryption key parts, to be used for recovery (infisical import-key [...parts])",
	DisableFlagsInUseLine: true,
	Example:               "infisical kms export",
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {

		loggedInDetails, err := util.GetCurrentLoggedInUserDetails()

		if err != nil {
			util.HandleError(err)
		}

		if !loggedInDetails.IsUserLoggedIn || loggedInDetails.LoginExpired {
			util.HandleError(fmt.Errorf("You must be logged in to run this command"))
		}

		httpClient := resty.New()
		httpClient.SetAuthToken(loggedInDetails.UserCredentials.JTWToken).
			SetHeader("Accept", "application/json")

		res, err := api.CallExportKmsRootEncryptionKey(httpClient)

		if err != nil {

			if strings.Contains(err.Error(), "configuration already exported") {
				util.HandleError(fmt.Errorf("This KMS encryption key has already been exported. You can only export the decryption key once."))
			} else {
				util.HandleError(err)
			}
		}

		boldGreen := color.New(color.FgGreen).Add(color.Bold)
		time.Sleep(time.Second * 1)
		boldGreen.Printf(">>>> Successfully exported KMS encryption key\n\n")

		plainBold := color.New(color.Bold)

		for i, part := range res.SecretParts {
			plainBold.Printf("Part %d: %v\n", i+1, part)
		}

		boldYellow := color.New(color.FgYellow).Add(color.Bold)
		boldYellow.Printf("\nPlease store these parts in a secure location. You will need them to recover your KMS encryption key.\nYou will not be able to export these credentials again in the future.\n\n")
	},
}

var importKeyCmd = &cobra.Command{
	Use:                   "import",
	Short:                 "Used to import your Infisical root encryption key parts, to be used for recovery (infisical import-key [...parts])",
	DisableFlagsInUseLine: true,
	Example:               "infisical kms import",
	Args:                  cobra.MinimumNArgs(6),
	Run: func(cmd *cobra.Command, args []string) {
		loggedInDetails, err := util.GetCurrentLoggedInUserDetails()

		if err != nil {
			util.HandleError(err)
		}

		if !loggedInDetails.IsUserLoggedIn || loggedInDetails.LoginExpired {
			util.HandleError(fmt.Errorf("You must be logged in to run this command"))
		}

		httpClient := resty.New()
		httpClient.SetAuthToken(loggedInDetails.UserCredentials.JTWToken).
			SetHeader("Accept", "application/json")

		err = api.CallImportKmsRootEncryptionKey(httpClient, api.ImportKmsRootKeyRequest{
			SecretParts: args,
		})

		if err != nil {
			if strings.Contains(err.Error(), "configuration was never exported") {
				util.HandleError(fmt.Errorf("This KMS encryption key has not been exported yet. You must export the key first before you can import it."))
			} else {
				util.HandleError(err)
			}
		}

		boldGreen := color.New(color.FgGreen).Add(color.Bold)
		time.Sleep(time.Second * 1)
		boldGreen.Printf(">>>> Successfully imported KMS encryption key\n\n")

		boldYellow := color.New(color.FgYellow).Add(color.Bold)
		boldYellow.Printf("Important: Make sure to set the `ROOT_KEY_ENCRYPTION_STRATEGY` environment variable to `BASIC` on your Infisical instance.\nNot doing this will likely result in having to re-import the key on the next instance restart.\n\n")
	},
}

func init() {
	kmsCmd.AddCommand(exportKeyCmd)
	kmsCmd.AddCommand(importKeyCmd)

	rootCmd.AddCommand(kmsCmd)

}
