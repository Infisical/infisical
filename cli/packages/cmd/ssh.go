/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/util"
	infisicalSdk "github.com/infisical/go-sdk"
	infisicalSdkUtil "github.com/infisical/go-sdk/packages/util"
	"github.com/spf13/cobra"
)

var sshCmd = &cobra.Command{
	Example:               `infisical ssh`,
	Short:                 "Used to issue SSH credentials",
	Use:                   "ssh",
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
}

var sshIssueCredentialsCmd = &cobra.Command{
	Example:               `ssh issue-credentials`,
	Short:                 "Used to issue SSH credentials against a certificate template",
	Use:                   "issue-credentials",
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
	Run:                   issueCredentials,
}

var sshSignKeyCmd = &cobra.Command{
	Example:               `ssh sign-key`,
	Short:                 "Used to sign a SSH public key against a certificate template",
	Use:                   "sign-key",
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
	Run:                   signKey,
}

func isValidKeyAlgorithm(algo infisicalSdkUtil.CertKeyAlgorithm) bool {
	switch algo {
	case infisicalSdkUtil.RSA2048, infisicalSdkUtil.RSA4096, infisicalSdkUtil.ECDSAP256, infisicalSdkUtil.ECDSAP384:
		return true
	default:
		return false
	}
}

func isValidCertType(certType infisicalSdkUtil.SshCertType) bool {
	switch certType {
	case infisicalSdkUtil.UserCert, infisicalSdkUtil.HostCert:
		return true
	default:
		return false
	}
}

// writeToFile writes content to the specified file with given permissions
func writeToFile(filePath string, content string, perm os.FileMode) error {
    // Ensure the directory exists
    dir := filepath.Dir(filePath)
    if err := os.MkdirAll(dir, 0755); err != nil {
        return fmt.Errorf("failed to create directory %s: %w", dir, err)
    }

    // Write the content to the file
    err := os.WriteFile(filePath, []byte(content), perm)
    if err != nil {
        return fmt.Errorf("failed to write to file %s: %w", filePath, err)
    }

    return nil
}

func issueCredentials(cmd *cobra.Command, args []string) {
	var infisicalToken string
	util.RequireLogin()
	loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails(true)
	if err != nil {
		util.HandleError(err, "Unable to authenticate")
	}

	if loggedInUserDetails.LoginExpired {
		util.PrintErrorMessageAndExit("Your login session has expired, please run [infisical login] and try again")
	}
	infisicalToken = loggedInUserDetails.UserCredentials.JTWToken
	
	projectId, err := cmd.Flags().GetString("projectId")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}
	if projectId == "" {
		util.PrintErrorMessageAndExit("You must set the --projectId flag")
	}

	templateName, err := cmd.Flags().GetString("templateName")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}
	if templateName == "" {
		util.PrintErrorMessageAndExit("You must set the --templateName flag")
	}

	principalsStr, err := cmd.Flags().GetString("principals")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	// Convert the comma-delimited string into a slice of strings
	principals := strings.Split(principalsStr, ",")

	// Trim whitespace around each principal
	for i, principal := range principals {
		principals[i] = strings.TrimSpace(principal)
	}

	keyAlgorithm, err := cmd.Flags().GetString("keyAlgorithm")
	if err != nil {
		util.HandleError(err, "Unable to parse keyAlgorithm flag")
	}

	if !isValidKeyAlgorithm(infisicalSdkUtil.CertKeyAlgorithm(keyAlgorithm)) {
		util.HandleError(fmt.Errorf("invalid keyAlgorithm: %s", keyAlgorithm), 
			"Valid values: RSA_2048, RSA_4096, EC_prime256v1, EC_secp384r1")
	}
	
	certType, err := cmd.Flags().GetString("certType")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	if !isValidCertType(infisicalSdkUtil.SshCertType(certType)) {
		util.HandleError(fmt.Errorf("invalid certType: %s", certType), 
			"Valid values: user, host")
	}
	
	ttl, err := cmd.Flags().GetString("ttl")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}
	
	keyId, err := cmd.Flags().GetString("keyId")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}
	
	outFilePath, err := cmd.Flags().GetString("outFilePath")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}
	
	fmt.Println("outFilePath a", outFilePath)

	// Determine the output directory
    var outputDir string
    if outFilePath == "" {
        // Use current working directory
        cwd, err := os.Getwd()
        if err != nil {
            util.HandleError(err, "Failed to get current working directory")
        }
        outputDir = cwd
		fmt.Println("outFilePath b", outputDir)
    } else {
        // Expand ~ to home directory if present
        if strings.HasPrefix(outFilePath, "~") {
            homeDir, err := os.UserHomeDir()
            if err != nil {
                util.HandleError(err, "Failed to resolve home directory")
            }
            outFilePath = strings.Replace(outFilePath, "~", homeDir, 1)
        }
        outputDir = outFilePath

        // Check if the directory exists; if not, create it
        info, err := os.Stat(outputDir)
        if os.IsNotExist(err) {
            err = os.MkdirAll(outputDir, 0755)
            if err != nil {
                util.HandleError(err, "Failed to create output directory")
            }
        } else if err != nil {
            util.HandleError(err, "Failed to access output directory")
        } else if !info.IsDir() {
            util.PrintErrorMessageAndExit("The provided --outFilePath is not a directory")
        }
    }

	infisicalClient := infisicalSdk.NewInfisicalClient(context.Background(), infisicalSdk.Config{
		SiteUrl:          config.INFISICAL_URL,
		UserAgent:        api.USER_AGENT,
		AutoTokenRefresh: false,
	})
	infisicalClient.Auth().SetAccessToken(infisicalToken)

	creds, err := infisicalClient.Ssh().IssueCredentials(infisicalSdk.IssueSshCredsOptions{
		ProjectID: projectId,
		TemplateName: templateName,
		Principals: principals,
		KeyAlgorithm: infisicalSdkUtil.CertKeyAlgorithm(keyAlgorithm),
		CertType: infisicalSdkUtil.SshCertType(certType),
		TTL: ttl,
		KeyID: keyId,
	})

	if err != nil {
		util.HandleError(err, "To issue SSH credentials")
	}

	fmt.Println(creds)

	// // Define file paths
    // privateKeyPath := filepath.Join(outputDir, "id_key")
    // publicKeyPath := filepath.Join(outputDir, "id_key.pub")
    // signedKeyPath := filepath.Join(outputDir, "id_key-cert.pub")

    // // Write Private Key
    // err = writeToFile(privateKeyPath, creds.PrivateKey, 0600)
    // if err != nil {
    //     util.HandleError(err, "Failed to write Private Key to file")
    // }

    // // Write Public Key
    // err = writeToFile(publicKeyPath, creds.PublicKey, 0644)
    // if err != nil {
    //     util.HandleError(err, "Failed to write Public Key to file")
    // }

    // // Write Signed Key (Certificate)
    // err = writeToFile(signedKeyPath, creds.SignedKey, 0644)
    // if err != nil {
    //     util.HandleError(err, "Failed to write Signed Key to file")
    // }

	// TODO: write creds.PrivateKey to outFilePath under id_key, creds.PublicKey to outFilePath under id_key.pub and creds.SignedKey to outFilePath under id_key-cert.pub
}

func signKey(cmd *cobra.Command, args []string) {
	var infisicalToken string
	util.RequireLogin()
	loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails(true)
	if err != nil {
		util.HandleError(err, "Unable to authenticate")
	}

	if loggedInUserDetails.LoginExpired {
		util.PrintErrorMessageAndExit("Your login session has expired, please run [infisical login] and try again")
	}
	infisicalToken = loggedInUserDetails.UserCredentials.JTWToken
	
	projectId, err := cmd.Flags().GetString("projectId")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}
	if projectId == "" {
		util.PrintErrorMessageAndExit("You must set the --projectId flag")
	}

	templateName, err := cmd.Flags().GetString("templateName")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}
	if templateName == "" {
		util.PrintErrorMessageAndExit("You must set the --templateName flag")
	}
	
	publicKey, err := cmd.Flags().GetString("publicKey")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}
	
	publicKeyFilePath, err := cmd.Flags().GetString("publicKeyFilePath")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	if publicKey == "" && publicKeyFilePath == "" {
		util.HandleError(fmt.Errorf("either --public-key or --public-key-file must be provided"), "Invalid input")
	}

	if publicKey != "" && publicKeyFilePath != "" {
		util.HandleError(fmt.Errorf("only one of --public-key or --public-key-file can be provided"), "Invalid input")
	}

	if publicKeyFilePath != "" {
		if strings.HasPrefix(publicKeyFilePath, "~") {
			// Expand the tilde (~) to the user's home directory
			homeDir, err := os.UserHomeDir()
			if err != nil {
				util.HandleError(err, "Failed to resolve home directory")
			}
			publicKeyFilePath = strings.Replace(publicKeyFilePath, "~", homeDir, 1)
		}
	
		content, err := os.ReadFile(publicKeyFilePath)
		if err != nil {
			util.HandleError(err, "Failed to read public key file")
		}
		publicKey = string(content)
	}

	principalsStr, err := cmd.Flags().GetString("principals")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	// Convert the comma-delimited string into a slice of strings
	principals := strings.Split(principalsStr, ",")

	// Trim whitespace around each principal
	for i, principal := range principals {
		principals[i] = strings.TrimSpace(principal)
	}
	
	certType, err := cmd.Flags().GetString("certType")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	if !isValidCertType(infisicalSdkUtil.SshCertType(certType)) {
		util.HandleError(fmt.Errorf("invalid certType: %s", certType), 
			"Valid values: user, host")
	}
	
	ttl, err := cmd.Flags().GetString("ttl")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}
	
	keyId, err := cmd.Flags().GetString("keyId")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	infisicalClient := infisicalSdk.NewInfisicalClient(context.Background(), infisicalSdk.Config{
		SiteUrl:          config.INFISICAL_URL,
		UserAgent:        api.USER_AGENT,
		AutoTokenRefresh: false,
	})
	infisicalClient.Auth().SetAccessToken(infisicalToken)

	creds, err := infisicalClient.Ssh().SignKey(infisicalSdk.SignSshPublicKeyOptions{
		ProjectID: projectId,
		TemplateName: templateName,
		PublicKey: publicKey,
		Principals: principals,
		CertType: infisicalSdkUtil.SshCertType(certType),
		TTL: ttl,
		KeyID: keyId,
	})

	if err != nil {
		util.HandleError(err, "To sign a SSH public key")
	}

	fmt.Println(creds)
}

func init() {
	sshSignKeyCmd.Flags().String("projectId", "", "The projectId to issue credentials for")
	sshSignKeyCmd.Flags().String("templateName", "", "The template name to issue credentials for")
	sshSignKeyCmd.Flags().String("publicKey", "", "The public key to sign")
	sshSignKeyCmd.Flags().String("publicKeyFilePath", "", "The path to the public key file to sign")
	sshSignKeyCmd.Flags().String("principals", "", "The principals that the certificate should be signed for")
	sshSignKeyCmd.Flags().String("certType", string(infisicalSdkUtil.UserCert), "The cert type for the created certificate")
	sshSignKeyCmd.Flags().String("ttl", "", "The ttl for the created certificate")
	sshSignKeyCmd.Flags().String("keyId", "", "The keyId that the created certificate should have")
	sshCmd.AddCommand(sshSignKeyCmd)

	sshIssueCredentialsCmd.Flags().String("projectId", "", "The projectId to issue SSH credentials for")
	sshIssueCredentialsCmd.Flags().String("templateName", "", "The template name to issue SSH credentials for")
	sshIssueCredentialsCmd.Flags().String("principals", "", "The principals to issue SSH credentials for")
	sshIssueCredentialsCmd.Flags().String("keyAlgorithm", string(infisicalSdkUtil.RSA2048), "The key algorithm to issue SSH credentials for")
	sshIssueCredentialsCmd.Flags().String("certType", string(infisicalSdkUtil.UserCert), "The cert type to issue SSH credentials for")
	sshIssueCredentialsCmd.Flags().String("ttl", "", "The ttl to issue SSH credentials for")
	sshIssueCredentialsCmd.Flags().String("keyId", "", "The keyId to issue SSH credentials for")
	sshIssueCredentialsCmd.Flags().String("outFilePath", "", "The path to the file to write the SSH credentials to. If not provided, the credentials will be saved to the current working directory")
	sshCmd.AddCommand(sshIssueCredentialsCmd)
	rootCmd.AddCommand(sshCmd)
}