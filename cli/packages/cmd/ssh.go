/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"context"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/util"
	infisicalSdk "github.com/infisical/go-sdk"
	infisicalSdkUtil "github.com/infisical/go-sdk/packages/util"
	"github.com/spf13/cobra"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
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

var algoToFileName = map[infisicalSdkUtil.CertKeyAlgorithm]string{
	infisicalSdkUtil.RSA2048:   "id_rsa_2048",
	infisicalSdkUtil.RSA4096:   "id_rsa_4096",
	infisicalSdkUtil.ECDSAP256: "id_ecdsa_p256",
	infisicalSdkUtil.ECDSAP384: "id_ecdsa_p384",
}

func isValidKeyAlgorithm(algo infisicalSdkUtil.CertKeyAlgorithm) bool {
	_, exists := algoToFileName[algo]
	return exists
}

func isValidCertType(certType infisicalSdkUtil.SshCertType) bool {
	switch certType {
	case infisicalSdkUtil.UserCert, infisicalSdkUtil.HostCert:
		return true
	default:
		return false
	}
}

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

func addCredentialsToAgent(privateKeyContent, certContent string) error {
	// Parse the private key
	privateKey, err := ssh.ParseRawPrivateKey([]byte(privateKeyContent))
	if err != nil {
		return fmt.Errorf("failed to parse private key: %w", err)
	}

	// Parse the certificate
	pubKey, _, _, _, err := ssh.ParseAuthorizedKey([]byte(certContent))
	if err != nil {
		return fmt.Errorf("failed to parse certificate: %w", err)
	}

	cert, ok := pubKey.(*ssh.Certificate)
	if !ok {
		return fmt.Errorf("parsed key is not a certificate")
	}
	// Calculate LifetimeSecs based on certificate's valid-to time
	validUntil := time.Unix(int64(cert.ValidBefore), 0)
	now := time.Now()

	// Handle ValidBefore as either a timestamp or an enumeration
	// SSH certificates use ValidBefore as a timestamp unless set to 0 or ~0
	if cert.ValidBefore == ssh.CertTimeInfinity {
		// If certificate never expires, set default lifetime to 1 year (can adjust as needed)
		validUntil = now.Add(365 * 24 * time.Hour)
	}

	// Calculate the duration until expiration
	lifetime := validUntil.Sub(now)
	if lifetime <= 0 {
		return fmt.Errorf("certificate is already expired")
	}

	// Convert duration to seconds
	lifetimeSecs := uint32(lifetime.Seconds())

	// Connect to the SSH agent
	socket := os.Getenv("SSH_AUTH_SOCK")
	if socket == "" {
		return fmt.Errorf("SSH_AUTH_SOCK not set")
	}

	conn, err := net.Dial("unix", socket)
	if err != nil {
		return fmt.Errorf("failed to connect to SSH agent: %w", err)
	}
	defer conn.Close()

	agentClient := agent.NewClient(conn)

	// Add the key with certificate to the agent
	err = agentClient.Add(agent.AddedKey{
		PrivateKey:   privateKey,
		Certificate:  cert,
		Comment:      "Added via Infisical CLI",
		LifetimeSecs: lifetimeSecs,
	})
	if err != nil {
		return fmt.Errorf("failed to add key to agent: %w", err)
	}

	return nil
}

func issueCredentials(cmd *cobra.Command, args []string) {

	token, err := util.GetInfisicalToken(cmd)
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	var infisicalToken string

	if token != nil && (token.Type == util.SERVICE_TOKEN_IDENTIFIER || token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER) {
		infisicalToken = token.Token
	} else {
		util.RequireLogin()
		util.RequireLocalWorkspaceFile()

		loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails(true)
		if err != nil {
			util.HandleError(err, "Unable to authenticate")
		}

		if loggedInUserDetails.LoginExpired {
			util.PrintErrorMessageAndExit("Your login session has expired, please run [infisical login] and try again")
		}
		infisicalToken = loggedInUserDetails.UserCredentials.JTWToken
	}

	certificateTemplateId, err := cmd.Flags().GetString("certificateTemplateId")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}
	if certificateTemplateId == "" {
		util.PrintErrorMessageAndExit("You must set the --certificateTemplateId flag")
	}

	principalsStr, err := cmd.Flags().GetString("principals")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	// Check if the input string is empty before splitting
	if principalsStr == "" {
		util.HandleError(fmt.Errorf("no principals provided"), "The 'principals' flag cannot be empty")
	}

	// Convert the comma-delimited string into a slice of strings
	principals := strings.Split(principalsStr, ",")
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

	addToAgent, err := cmd.Flags().GetBool("addToAgent")
	if err != nil {
		util.HandleError(err, "Unable to parse addToAgent flag")
	}

	if outFilePath == "" && addToAgent == false {
		util.PrintErrorMessageAndExit("You must provide either --outFilePath or --addToAgent flag to use this command")
	}

	var (
		outputDir      string
		privateKeyPath string
		publicKeyPath  string
		signedKeyPath  string
	)

	if outFilePath != "" {
		// Expand ~ to home directory if present
		if strings.HasPrefix(outFilePath, "~") {
			homeDir, err := os.UserHomeDir()
			if err != nil {
				util.HandleError(err, "Failed to resolve home directory")
			}
			outFilePath = strings.Replace(outFilePath, "~", homeDir, 1)
		}

		// Check if outFilePath ends with "-cert.pub"
		if strings.HasSuffix(outFilePath, "-cert.pub") {
			// Treat outFilePath as the signed key path
			signedKeyPath = outFilePath

			// Derive the base name by removing "-cert.pub"
			baseName := strings.TrimSuffix(filepath.Base(outFilePath), "-cert.pub")

			// Set the output directory
			outputDir = filepath.Dir(outFilePath)

			// Define private and public key paths
			privateKeyPath = filepath.Join(outputDir, baseName)
			publicKeyPath = filepath.Join(outputDir, baseName+".pub")
		} else {
			// Treat outFilePath as a directory
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
	}

	// Define file names based on key algorithm
	fileName := algoToFileName[infisicalSdkUtil.CertKeyAlgorithm(keyAlgorithm)]

	// Define file paths
	privateKeyPath = filepath.Join(outputDir, fileName)
	publicKeyPath = filepath.Join(outputDir, fileName+".pub")
	signedKeyPath = filepath.Join(outputDir, fileName+"-cert.pub")

	// If outFilePath ends with "-cert.pub", ensure the signedKeyPath is set
	if strings.HasSuffix(outFilePath, "-cert.pub") {
		// Ensure the signedKeyPath was set
		if signedKeyPath == "" {
			util.HandleError(fmt.Errorf("signedKeyPath is not set correctly"), "Internal error")
		}
	} else {
		// Ensure all paths are set
		if privateKeyPath == "" || publicKeyPath == "" || signedKeyPath == "" {
			util.HandleError(fmt.Errorf("file paths are not set correctly"), "Internal error")
		}
	}

	customHeaders, err := util.GetInfisicalCustomHeadersMap()
	if err != nil {
		util.HandleError(err, "Unable to get custom headers")
	}

	infisicalClient := infisicalSdk.NewInfisicalClient(context.Background(), infisicalSdk.Config{
		SiteUrl:          config.INFISICAL_URL,
		UserAgent:        api.USER_AGENT,
		AutoTokenRefresh: false,
		CustomHeaders:    customHeaders,
	})
	infisicalClient.Auth().SetAccessToken(infisicalToken)

	creds, err := infisicalClient.Ssh().IssueCredentials(infisicalSdk.IssueSshCredsOptions{
		CertificateTemplateID: certificateTemplateId,
		Principals:            principals,
		KeyAlgorithm:          infisicalSdkUtil.CertKeyAlgorithm(keyAlgorithm),
		CertType:              infisicalSdkUtil.SshCertType(certType),
		TTL:                   ttl,
		KeyID:                 keyId,
	})

	if err != nil {
		util.HandleError(err, "Failed to issue SSH credentials")
	}

	if outFilePath != "" {
		// If signedKeyPath wasn't set in the directory scenario, set it now
		if signedKeyPath == "" {
			fileName := algoToFileName[infisicalSdkUtil.CertKeyAlgorithm(keyAlgorithm)]
			signedKeyPath = filepath.Join(outputDir, fileName+"-cert.pub")
		}

		if privateKeyPath == "" {
			privateKeyPath = filepath.Join(outputDir, algoToFileName[infisicalSdkUtil.CertKeyAlgorithm(keyAlgorithm)])
		}
		err = writeToFile(privateKeyPath, creds.PrivateKey, 0600)
		if err != nil {
			util.HandleError(err, "Failed to write Private Key to file")
		}

		if publicKeyPath == "" {
			publicKeyPath = privateKeyPath + ".pub"
		}
		err = writeToFile(publicKeyPath, creds.PublicKey, 0644)
		if err != nil {
			util.HandleError(err, "Failed to write Public Key to file")
		}

		err = writeToFile(signedKeyPath, creds.SignedKey, 0644)
		if err != nil {
			util.HandleError(err, "Failed to write Signed Key to file")
		}

		fmt.Println("Successfully wrote SSH certificate to:", signedKeyPath)
	}

	// Add SSH credentials to the SSH agent if needed
	if addToAgent {
		// Call the helper function to handle add-to-agent flow
		err := addCredentialsToAgent(creds.PrivateKey, creds.SignedKey)
		if err != nil {
			util.HandleError(err, "Failed to add keys to SSH agent")
		} else {
			fmt.Println("The SSH key and certificate have been successfully added to your ssh-agent.")
		}
	}
}

func signKey(cmd *cobra.Command, args []string) {

	token, err := util.GetInfisicalToken(cmd)
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	var infisicalToken string

	if token != nil && (token.Type == util.SERVICE_TOKEN_IDENTIFIER || token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER) {
		infisicalToken = token.Token
	} else {
		util.RequireLogin()
		util.RequireLocalWorkspaceFile()

		loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails(true)
		if err != nil {
			util.HandleError(err, "Unable to authenticate")
		}

		if loggedInUserDetails.LoginExpired {
			util.PrintErrorMessageAndExit("Your login session has expired, please run [infisical login] and try again")
		}
		infisicalToken = loggedInUserDetails.UserCredentials.JTWToken
	}

	certificateTemplateId, err := cmd.Flags().GetString("certificateTemplateId")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}
	if certificateTemplateId == "" {
		util.PrintErrorMessageAndExit("You must set the --certificateTemplateId flag")
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
		util.HandleError(fmt.Errorf("either --publicKey or --publicKeyFilePath must be provided"), "Invalid input")
	}

	if publicKey != "" && publicKeyFilePath != "" {
		util.HandleError(fmt.Errorf("only one of --publicKey or --publicKeyFile can be provided"), "Invalid input")
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

		// Ensure the file has a .pub extension
		if !strings.HasSuffix(publicKeyFilePath, ".pub") {
			util.HandleError(fmt.Errorf("public key file must have a .pub extension"), "Invalid input")
		}

		content, err := os.ReadFile(publicKeyFilePath)
		if err != nil {
			util.HandleError(err, "Failed to read public key file")
		}

		publicKey = strings.TrimSpace(string(content))
	}

	if strings.TrimSpace(publicKey) == "" {
		util.HandleError(fmt.Errorf("Public key is empty"), "Invalid input")
	}

	principalsStr, err := cmd.Flags().GetString("principals")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	// Check if the input string is empty before splitting
	if principalsStr == "" {
		util.HandleError(fmt.Errorf("no principals provided"), "The 'principals' flag cannot be empty")
	}

	// Convert the comma-delimited string into a slice of strings
	principals := strings.Split(principalsStr, ",")
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

	outFilePath, err := cmd.Flags().GetString("outFilePath")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}

	var (
		outputDir     string
		signedKeyPath string
	)

	if outFilePath == "" {
		// Use current working directory
		if err != nil {
			util.HandleError(err, "Failed to get current working directory")
		}

		// check if public key path exists
		if publicKeyFilePath == "" {
			util.PrintErrorMessageAndExit("--outFilePath must be specified when --publicKeyFilePath is not provided")
		}

		outputDir = filepath.Dir(publicKeyFilePath)
		// Derive the base name by removing "-cert.pub"
		baseName := strings.TrimSuffix(filepath.Base(publicKeyFilePath), ".pub")
		signedKeyPath = filepath.Join(outputDir, baseName+"-cert.pub")
	} else {
		// Expand ~ to home directory if present
		if strings.HasPrefix(outFilePath, "~") {
			homeDir, err := os.UserHomeDir()
			if err != nil {
				util.HandleError(err, "Failed to resolve home directory")
			}
			outFilePath = strings.Replace(outFilePath, "~", homeDir, 1)
		}

		// Check if outFilePath ends with "-cert.pub"
		if !strings.HasSuffix(outFilePath, "-cert.pub") {
			util.PrintErrorMessageAndExit("--outFilePath must end with -cert.pub")
		}

		// Extract the directory from outFilePath
		outputDir = filepath.Dir(outFilePath)

		// Validate the output directory
		info, err := os.Stat(outputDir)
		if os.IsNotExist(err) {
			// Directory does not exist; attempt to create it
			err = os.MkdirAll(outputDir, 0755)
			if err != nil {
				util.HandleError(err, "Failed to create output directory")
			}
		} else if err != nil {
			// Other errors accessing the directory
			util.HandleError(err, "Failed to access output directory")
		} else if !info.IsDir() {
			// Path exists but is not a directory
			util.PrintErrorMessageAndExit("The provided --outFilePath's directory is not valid")
		}

		signedKeyPath = outFilePath
	}

	customHeaders, err := util.GetInfisicalCustomHeadersMap()
	if err != nil {
		util.HandleError(err, "Unable to get custom headers")
	}

	infisicalClient := infisicalSdk.NewInfisicalClient(context.Background(), infisicalSdk.Config{
		SiteUrl:          config.INFISICAL_URL,
		UserAgent:        api.USER_AGENT,
		AutoTokenRefresh: false,
		CustomHeaders:    customHeaders,
	})
	infisicalClient.Auth().SetAccessToken(infisicalToken)

	creds, err := infisicalClient.Ssh().SignKey(infisicalSdk.SignSshPublicKeyOptions{
		CertificateTemplateID: certificateTemplateId,
		PublicKey:             publicKey,
		Principals:            principals,
		CertType:              infisicalSdkUtil.SshCertType(certType),
		TTL:                   ttl,
		KeyID:                 keyId,
	})

	if err != nil {
		util.HandleError(err, "Failed to sign SSH public key")
	}

	err = writeToFile(signedKeyPath, creds.SignedKey, 0644)
	if err != nil {
		util.HandleError(err, "Failed to write Signed Key to file")
	}

	fmt.Println("Successfully wrote SSH certificate to:", signedKeyPath)
}

func init() {
	sshSignKeyCmd.Flags().String("token", "", "Issue SSH certificate using machine identity access token")
	sshSignKeyCmd.Flags().String("certificateTemplateId", "", "The ID of the SSH certificate template to issue the SSH certificate for")
	sshSignKeyCmd.Flags().String("publicKey", "", "The public key to sign")
	sshSignKeyCmd.Flags().String("publicKeyFilePath", "", "The file path to the public key file to sign")
	sshSignKeyCmd.Flags().String("outFilePath", "", "The path to write the SSH certificate to such as ~/.ssh/id_rsa-cert.pub. If not provided, the credentials will be saved to the directory of the specified public key file path or the current working directory")
	sshSignKeyCmd.Flags().String("principals", "", "The principals that the certificate should be signed for")
	sshSignKeyCmd.Flags().String("certType", string(infisicalSdkUtil.UserCert), "The cert type for the created certificate")
	sshSignKeyCmd.Flags().String("ttl", "", "The ttl for the created certificate")
	sshSignKeyCmd.Flags().String("keyId", "", "The keyId that the created certificate should have")
	sshCmd.AddCommand(sshSignKeyCmd)

	sshIssueCredentialsCmd.Flags().String("token", "", "Issue SSH credentials using machine identity access token")
	sshIssueCredentialsCmd.Flags().String("certificateTemplateId", "", "The ID of the SSH certificate template to issue SSH credentials for")
	sshIssueCredentialsCmd.Flags().String("principals", "", "The principals to issue SSH credentials for")
	sshIssueCredentialsCmd.Flags().String("keyAlgorithm", string(infisicalSdkUtil.RSA2048), "The key algorithm to issue SSH credentials for")
	sshIssueCredentialsCmd.Flags().String("certType", string(infisicalSdkUtil.UserCert), "The cert type to issue SSH credentials for")
	sshIssueCredentialsCmd.Flags().String("ttl", "", "The ttl to issue SSH credentials for")
	sshIssueCredentialsCmd.Flags().String("keyId", "", "The keyId to issue SSH credentials for")
	sshIssueCredentialsCmd.Flags().String("outFilePath", "", "The path to write the SSH credentials to such as ~/.ssh, ./some_folder, ./some_folder/id_rsa-cert.pub. If not provided, the credentials will be saved to the current working directory")
	sshIssueCredentialsCmd.Flags().Bool("addToAgent", false, "Whether to add issued SSH credentials to the SSH agent")
	sshCmd.AddCommand(sshIssueCredentialsCmd)
	rootCmd.AddCommand(sshCmd)
}
