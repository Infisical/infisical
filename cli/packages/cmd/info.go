/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"fmt"
	"sort"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/util"
)

var infoCmd = &cobra.Command{
	Use:   "info",
	Short: "Used to display your Infisical CLI global configuration",
	Run: func(cmd *cobra.Command, args []string) {
		// set the colors
		white := color.New(color.FgWhite)
		yellow := color.New(color.FgYellow)
		boldWhite := white.Add(color.Bold)

		// sort the keys alphabetically (consistent output)
		cfg := config.GetConfig()
		var keys []string
		for key := range cfg {
			keys = append(keys, key)
		}
		sort.Strings(keys)

		// print the version and the current configuration variables
		boldWhite.Print("\nVersion: ")
		fmt.Println(util.CLI_VERSION)
		boldWhite.Println("\nConfiguration: ")
		for _, key := range keys {
			yellow.Printf(" %s: ", key)
			fmt.Printf("%v\n", cfg[key])
		}
	},
}

func init() {
	rootCmd.AddCommand(infoCmd)
}
