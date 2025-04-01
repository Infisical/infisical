/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
)

var bootstrapCmd = &cobra.Command{
	Use:                   "bootstrap",
	Short:                 "Used to bootstrap your Infisical instance",
	DisableFlagsInUseLine: true,
	Example:               "infisical bootstrap",
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		email, _ := cmd.Flags().GetString("email")
		if email == "" {
			if envEmail, ok := os.LookupEnv("INFISICAL_ADMIN_EMAIL"); ok {
				email = envEmail
			}
		}

		if email == "" {
			log.Error().Msg("email is required")
			return
		}

		password, _ := cmd.Flags().GetString("password")
		if password == "" {
			if envPassword, ok := os.LookupEnv("INFISICAL_ADMIN_PASSWORD"); ok {
				password = envPassword
			}
		}

		if password == "" {
			log.Error().Msg("password is required")
			return
		}

		organization, _ := cmd.Flags().GetString("organization")
		if organization == "" {
			if envOrganization, ok := os.LookupEnv("INFISICAL_ADMIN_ORGANIZATION"); ok {
				organization = envOrganization
			}
		}

		if organization == "" {
			log.Error().Msg("organization is required")
			return
		}

		domain, _ := cmd.Flags().GetString("domain")
		if domain == "" {
			if envDomain, ok := os.LookupEnv("INFISICAL_API_URL"); ok {
				domain = envDomain
			}
		}

		if domain == "" {
			log.Error().Msg("domain is required")
			return
		}

		httpClient, err := util.GetRestyClientWithCustomHeaders()
		if err != nil {
			log.Error().Msgf("Failed to get resty client with custom headers: %v", err)
			return
		}
		httpClient.SetHeader("Accept", "application/json")

		bootstrapResponse, err := api.CallBootstrapInstance(httpClient, api.BootstrapInstanceRequest{
			Domain:       util.AppendAPIEndpoint(domain),
			Email:        email,
			Password:     password,
			Organization: organization,
		})

		if err != nil {
			log.Error().Msgf("Failed to bootstrap instance: %v", err)
			return
		}

		responseJSON, err := json.MarshalIndent(bootstrapResponse, "", "  ")
		if err != nil {
			log.Fatal().Msgf("Failed to convert response to JSON: %v", err)
			return
		}
		fmt.Println(string(responseJSON))
	},
}

func init() {
	bootstrapCmd.Flags().String("domain", "", "The domain of your self-hosted Infisical instance")
	bootstrapCmd.Flags().String("email", "", "The desired email address of the instance admin")
	bootstrapCmd.Flags().String("password", "", "The desired password of the instance admin")
	bootstrapCmd.Flags().String("organization", "", "The name of the organization to create for the instance")

	rootCmd.AddCommand(bootstrapCmd)
}
