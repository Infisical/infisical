/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"fmt"

	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/util"
	kmip "github.com/infisical/infisical-kmip"
	"github.com/spf13/cobra"
)

var kmipCmd = &cobra.Command{
	Example:               `infisical kmip`,
	Short:                 "Used to manage KMIP servers",
	Use:                   "kmip",
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
}

var kmipStartCmd = &cobra.Command{
	Example:               `infisical kmip start`,
	Short:                 "Used to start a KMIP server",
	Use:                   "start",
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
	Run:                   startKmipServer,
}

func startKmipServer(cmd *cobra.Command, args []string) {
	listenAddr, err := cmd.Flags().GetString("listen-address")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	identityAuthMethod, err := cmd.Flags().GetString("identity-auth-method")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	authMethodValid, strategy := util.IsAuthMethodValid(identityAuthMethod, false)
	if !authMethodValid {
		util.PrintErrorMessageAndExit(fmt.Sprintf("Invalid login method: %s", identityAuthMethod))
	}

	var identityClientId string
	var identityClientSecret string

	if strategy == util.AuthStrategy.UNIVERSAL_AUTH {
		identityClientId, err = util.GetCmdFlagOrEnv(cmd, "identity-client-id", []string{util.INFISICAL_UNIVERSAL_AUTH_CLIENT_ID_NAME})

		if err != nil {
			util.HandleError(err, "Unable to parse identity client ID")
		}

		identityClientSecret, err = util.GetCmdFlagOrEnv(cmd, "identity-client-secret", []string{util.INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET_NAME})
		if err != nil {
			util.HandleError(err, "Unable to parse identity client secret")
		}
	} else {
		util.PrintErrorMessageAndExit(fmt.Sprintf("Unsupported login method: %s", identityAuthMethod))
	}

	serverName, err := cmd.Flags().GetString("server-name")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	certificateTTL, err := cmd.Flags().GetString("certificate-ttl")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	hostnamesOrIps, err := cmd.Flags().GetString("hostnames-or-ips")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	kmip.StartServer(kmip.ServerConfig{
		Addr:                 listenAddr,
		InfisicalBaseAPIURL:  config.INFISICAL_URL,
		IdentityClientId:     identityClientId,
		IdentityClientSecret: identityClientSecret,
		ServerName:           serverName,
		CertificateTTL:       certificateTTL,
		HostnamesOrIps:       hostnamesOrIps,
	})
}

func init() {
	kmipStartCmd.Flags().String("listen-address", "localhost:5696", "The address for the KMIP server to listen on. Defaults to localhost:5696")
	kmipStartCmd.Flags().String("identity-auth-method", string(util.AuthStrategy.UNIVERSAL_AUTH), "The auth method to use for authenticating the machine identity. Defaults to universal-auth.")
	kmipStartCmd.Flags().String("identity-client-id", "", "Universal auth client ID of machine identity")
	kmipStartCmd.Flags().String("identity-client-secret", "", "Universal auth client secret of machine identity")
	kmipStartCmd.Flags().String("server-name", "kmip-server", "The name of the KMIP server")
	kmipStartCmd.Flags().String("certificate-ttl", "1y", "The TTL duration for the server certificate")
	kmipStartCmd.Flags().String("hostnames-or-ips", "", "Comma-separated list of hostnames or IPs")

	kmipCmd.AddCommand(kmipStartCmd)
	rootCmd.AddCommand(kmipCmd)
}
