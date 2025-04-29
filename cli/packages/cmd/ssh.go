/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/util"
	infisicalSdk "github.com/infisical/go-sdk"
	infisicalSdkUtil "github.com/infisical/go-sdk/packages/util"
	"github.com/manifoldco/promptui"
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

var sshConnectCmd = &cobra.Command{
	Use:   "connect",
	Short: "Connect to an SSH host using issued credentials",
	Run:   sshConnect,
}

var sshAddHostCmd = &cobra.Command{
	Use:   "add-host",
	Short: "Register a new SSH host with Infisical",
	Run:   sshAddHost,
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

	if outFilePath == "" && !addToAgent {
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

func sshConnect(cmd *cobra.Command, args []string) {
	token, err := util.GetInfisicalToken(cmd)
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}
	
	var infisicalToken string

	if token != nil && (token.Type == util.SERVICE_TOKEN_IDENTIFIER || token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER) {
		infisicalToken = token.Token
	} else {
		util.RequireLogin()

		loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails(true)
		if err != nil {
			util.HandleError(err, "Unable to authenticate")
		}

		if loggedInUserDetails.LoginExpired {
			util.PrintErrorMessageAndExit("Your login session has expired, please run [infisical login] and try again")
		}
		infisicalToken = loggedInUserDetails.UserCredentials.JTWToken
	}

	writeHostCaToFile, err := cmd.Flags().GetBool("write-host-ca-to-file")
	if err != nil {
		util.HandleError(err, "Unable to parse --write-host-ca-to-file flag")
	}

	outFilePath, err := cmd.Flags().GetString("out-file-path")
	if err != nil {
		util.HandleError(err, "Unable to parse flag")
	}
	
	hostname, _ := cmd.Flags().GetString("hostname")
	loginUser, _ := cmd.Flags().GetString("login-user")

	var outputDir, privateKeyPath, publicKeyPath, signedKeyPath string
	if outFilePath != "" {
		if strings.HasPrefix(outFilePath, "~") {
			homeDir, err := os.UserHomeDir()
			if err != nil {
				util.HandleError(err, "Failed to resolve home directory")
			}
			outFilePath = strings.Replace(outFilePath, "~", homeDir, 1)
		}

		if strings.HasSuffix(outFilePath, "-cert.pub") {
			signedKeyPath = outFilePath
			baseName := strings.TrimSuffix(filepath.Base(outFilePath), "-cert.pub")
			outputDir = filepath.Dir(outFilePath)
			privateKeyPath = filepath.Join(outputDir, baseName)
			publicKeyPath = filepath.Join(outputDir, baseName+".pub")
		} else {
			outputDir = outFilePath
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
			fileName := "id_ed25519"
			privateKeyPath = filepath.Join(outputDir, fileName)
			publicKeyPath = filepath.Join(outputDir, fileName+".pub")
			signedKeyPath = filepath.Join(outputDir, fileName+"-cert.pub")
		}

		if privateKeyPath == "" || publicKeyPath == "" || signedKeyPath == "" {
			util.PrintErrorMessageAndExit("Failed to resolve file paths for writing credentials")
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

	// Fetch SSH Hosts
	hosts, err := infisicalClient.Ssh().GetSshHosts(infisicalSdk.GetSshHostsOptions{})
	if err != nil {
		util.HandleError(err, "Failed to fetch SSH hosts")
	}
	if len(hosts) == 0 {
		util.PrintErrorMessageAndExit("You do not have access to any SSH hosts")
	}

	var selectedHost = hosts[0]
	if hostname != "" {
		foundHost := false
		for _, h := range hosts {
			if h.Hostname == hostname {
				selectedHost = h
				foundHost = true
				break
			}
		}
		if !foundHost {
			util.PrintErrorMessageAndExit("Specified --hostname not found or not accessible")
		}
	} else {
		hostNames := make([]string, len(hosts))
		for i, h := range hosts {
			if h.Alias != "" {
				hostNames[i] = h.Alias
			} else {
				hostNames[i] = h.Hostname
			}
		}

		hostPrompt := promptui.Select{
			Label: "Select an SSH Host",
			Items: hostNames,
			Size:  10,
		}

		hostIdx, _, err := hostPrompt.Run()
		if err != nil {
			util.HandleError(err, "Prompt failed")
		}

		selectedHost = hosts[hostIdx]
	}

	var selectedLoginUser string
	if loginUser != "" {
		foundLoginUser := false
		for _, m := range selectedHost.LoginMappings {
			if m.LoginUser == loginUser {
				selectedLoginUser = loginUser
				foundLoginUser = true
				break
			}
		}
		if !foundLoginUser {
			util.PrintErrorMessageAndExit("Specified --loginUser not valid for selected host")
		}
	} else {
		if len(selectedHost.LoginMappings) == 0 {
			util.PrintErrorMessageAndExit("No login users available for selected host")
		}
		loginUsers := make([]string, len(selectedHost.LoginMappings))
		for i, m := range selectedHost.LoginMappings {
			loginUsers[i] = m.LoginUser
		}
		loginPrompt := promptui.Select{
			Label: "Select Login User",
			Items: loginUsers,
			Size:  5,
		}
		loginIdx, _, err := loginPrompt.Run()
		if err != nil {
			util.HandleError(err, "Prompt failed")
		}
		selectedLoginUser = selectedHost.LoginMappings[loginIdx].LoginUser
	}

	// Issue SSH creds for host
	creds, err := infisicalClient.Ssh().IssueSshHostUserCert(selectedHost.ID, infisicalSdk.IssueSshHostUserCertOptions{
		LoginUser: selectedLoginUser,
	})
	if err != nil {
		util.HandleError(err, "Failed to issue SSH credentials")
	}

	// Write Host CA public key to known_hosts if enabled
	if writeHostCaToFile {
		hostCaPublicKey, err := infisicalClient.Ssh().GetSshHostHostCaPublicKey(selectedHost.ID)
		if err != nil {
			util.HandleError(err, "Failed to fetch Host CA public key")
		}

		// Build @cert-authority line
		caLine := fmt.Sprintf("@cert-authority %s %s\n", selectedHost.Hostname, strings.TrimSpace(hostCaPublicKey))

		// Determine known_hosts path
		sshDir := filepath.Join(os.Getenv("HOME"), ".ssh")
		knownHostsPath := filepath.Join(sshDir, "known_hosts")

		// Ensure ~/.ssh exists
		if _, err := os.Stat(sshDir); os.IsNotExist(err) {
			if err := os.MkdirAll(sshDir, 0700); err != nil {
				util.HandleError(err, "Failed to create ~/.ssh directory")
			}
		}

		// Check if CA line already exists
		knownHostsBytes, _ := os.ReadFile(knownHostsPath)
		if !strings.Contains(string(knownHostsBytes), caLine) {
			f, err := os.OpenFile(knownHostsPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
			if err != nil {
				util.HandleError(err, "Failed to open known_hosts file")
			}
			defer f.Close()

			if _, err := f.WriteString(caLine); err != nil {
				util.HandleError(err, "Failed to write Host CA to known_hosts")
			}

			fmt.Printf("Successfully wrote Host CA entry to %s\n", knownHostsPath)
		}
	}

	if outFilePath != "" {
		err = writeToFile(privateKeyPath, creds.PrivateKey, 0600)
		if err != nil {
			util.HandleError(err, "Failed to write private key")
		}
		err = writeToFile(publicKeyPath, creds.PublicKey, 0644)
		if err != nil {
			util.HandleError(err, "Failed to write public key")
		}
		err = writeToFile(signedKeyPath, creds.SignedKey, 0644)
		if err != nil {
			util.HandleError(err, "Failed to write signed cert")
		}
		fmt.Printf("Successfully wrote credentials to %s, %s, and %s\n", privateKeyPath, publicKeyPath, signedKeyPath)
		return
	}

	// Load credentials into SSH agent
	err = addCredentialsToAgent(creds.PrivateKey, creds.SignedKey)
	if err != nil {
		util.HandleError(err, "Failed to add credentials to SSH agent")
	}
	fmt.Println("✔ SSH credentials successfully added to agent")

	// Connect to host using system ssh and agent
	target := fmt.Sprintf("%s@%s", selectedLoginUser, selectedHost.Hostname)
	fmt.Printf("Connecting to %s...\n", target)

	sshCmd := exec.Command("ssh", target)
	sshCmd.Stdin = os.Stdin
	sshCmd.Stdout = os.Stdout
	sshCmd.Stderr = os.Stderr

	err = sshCmd.Run()
	if err != nil {
		util.HandleError(err, "SSH connection failed")
	}	
}

func sshAddHost(cmd *cobra.Command, args []string) {

	token, err := util.GetInfisicalToken(cmd)
	if err != nil {
		util.HandleError(err, "Unable to parse token")
	}

	var infisicalToken string
	if token != nil && (token.Type == util.SERVICE_TOKEN_IDENTIFIER || token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER) {
		infisicalToken = token.Token
	} else {
		util.RequireLogin()

		loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails(true)
		if err != nil {
			util.HandleError(err, "Unable to authenticate")
		}
		if loggedInUserDetails.LoginExpired {
			util.PrintErrorMessageAndExit("Your login session has expired, please run [infisical login]")
		}
		infisicalToken = loggedInUserDetails.UserCredentials.JTWToken
	}

	projectId, err := cmd.Flags().GetString("projectId")
	if err != nil {
		util.HandleError(err, "Unable to parse --projectId flag")
	}
	if projectId == "" {
		util.PrintErrorMessageAndExit("You must provide --projectId")
	}

	hostname, err := cmd.Flags().GetString("hostname")
	if err != nil {
		util.HandleError(err, "Unable to parse --hostname flag")
	}
	if hostname == "" {
		util.PrintErrorMessageAndExit("You must provide --hostname")
	}

	alias, err := cmd.Flags().GetString("alias")
	if err != nil {
		util.HandleError(err, "Unable to parse --alias flag")
	}
	
	// if alias == "" {
	// 	util.PrintErrorMessageAndExit("You must provide --alias")
	// }

	writeUserCaToFile, err := cmd.Flags().GetBool("write-user-ca-to-file")
	if err != nil {
		util.HandleError(err, "Unable to parse --write-user-ca-to-file flag")
	}

	userCaOutFilePath, err := cmd.Flags().GetString("user-ca-out-file-path")
	if err != nil {
		util.HandleError(err, "Unable to parse --user-ca-out-file-path flag")
	}

	writeHostCertToFile, err := cmd.Flags().GetBool("write-host-cert-to-file")
	if err != nil {
		util.HandleError(err, "Unable to parse --write-host-cert-to-file flag")
	}

	configureSshd, err := cmd.Flags().GetBool("configure-sshd")
	if err != nil {
		util.HandleError(err, "Unable to parse --configure-sshd flag")
	}

	forceOverwrite, err := cmd.Flags().GetBool("force")
	if err != nil {
		util.HandleError(err, "Unable to parse --force flag")
	}

	if configureSshd && (!writeUserCaToFile || !writeHostCertToFile) {
		util.PrintErrorMessageAndExit("--configure-sshd requires both --write-user-ca-to-file and --write-host-cert-to-file to also be set")
	}
	
	// Pre-check for file overwrites before proceeding
	if writeUserCaToFile {
		if strings.HasPrefix(userCaOutFilePath, "~") {
			homeDir, err := os.UserHomeDir()
			if err != nil {
				util.HandleError(err, "Unable to resolve ~ in user-ca-out-file-path")
			}
			userCaOutFilePath = strings.Replace(userCaOutFilePath, "~", homeDir, 1)
		}
		if _, err := os.Stat(userCaOutFilePath); err == nil && !forceOverwrite {
			util.PrintErrorMessageAndExit("File already exists at " + userCaOutFilePath + ". Use --force to overwrite.")
		}
	}

	keyTypes := []string{"ed25519", "ecdsa", "rsa"}
	var hostKeyPath, certOutPath, hostPrivateKeyPath string
	if writeHostCertToFile {
		for _, keyType := range keyTypes {
			pub := fmt.Sprintf("/etc/ssh/ssh_host_%s_key.pub", keyType)
			cert := fmt.Sprintf("/etc/ssh/ssh_host_%s_key-cert.pub", keyType)
			priv := fmt.Sprintf("/etc/ssh/ssh_host_%s_key", keyType)

			if _, err := os.Stat(pub); err == nil {
				hostKeyPath = pub
				certOutPath = cert
				hostPrivateKeyPath = priv
				break
			}
		}

		if hostKeyPath == "" {
			util.PrintErrorMessageAndExit("No supported SSH host public key found at /etc/ssh")
		}

		if _, err := os.Stat(certOutPath); err == nil && !forceOverwrite {
			util.PrintErrorMessageAndExit("File already exists at " + certOutPath + ". Use --force to overwrite.")
		}
	}

	if configureSshd {
		sshdConfig := "/etc/ssh/sshd_config"
		existing, err := os.ReadFile(sshdConfig)
		if err != nil {
			util.HandleError(err, "Failed to read sshd_config")
		}
		configLines := []string{
			"TrustedUserCAKeys " + userCaOutFilePath,
			"HostKey " + hostPrivateKeyPath,
			"HostCertificate " + certOutPath,
		}
		for _, line := range configLines {
			for _, existingLine := range strings.Split(string(existing), "\n") {
				trimmed := strings.TrimSpace(existingLine)
				if trimmed == line && !strings.HasPrefix(trimmed, "#") && !forceOverwrite {
					util.PrintErrorMessageAndExit("sshd_config already contains: " + line + ". Use --force to overwrite.")
				}
			}
		}
	}

	customHeaders, err := util.GetInfisicalCustomHeadersMap()
	if err != nil {
		util.HandleError(err, "Unable to get custom headers")
	}

	client := infisicalSdk.NewInfisicalClient(context.Background(), infisicalSdk.Config{
		SiteUrl:          config.INFISICAL_URL,
		UserAgent:        api.USER_AGENT,
		AutoTokenRefresh: false,
		CustomHeaders:    customHeaders,
	})
	client.Auth().SetAccessToken(infisicalToken)

	host, err := client.Ssh().AddSshHost(infisicalSdk.AddSshHostOptions{
		ProjectID: projectId,
		Hostname:  hostname,
		Alias:     alias,
	})
	if err != nil {
		util.HandleError(err, "Failed to register SSH host")
	}

	fmt.Println("✅ Successfully registered host:", host.Hostname)

	if writeUserCaToFile {
		publicKey, err := client.Ssh().GetSshHostUserCaPublicKey(host.ID)
		if err != nil {
			util.HandleError(err, "Failed to fetch associated User CA public key")
		}

		if err := writeToFile(userCaOutFilePath, publicKey, 0644); err != nil {
			util.HandleError(err, "Failed to write User CA public key to file")
		}

		fmt.Println("📁 Wrote User CA public key to:", userCaOutFilePath)
	}

	if writeHostCertToFile {
		pubKeyBytes, err := os.ReadFile(hostKeyPath)
		if err != nil {
			util.HandleError(err, "Failed to read SSH host public key")
		}
		res, err := client.Ssh().IssueSshHostHostCert(host.ID, infisicalSdk.IssueSshHostHostCertOptions{
			PublicKey: string(pubKeyBytes),
		})
		if err != nil {
			util.HandleError(err, "Failed to issue SSH host certificate")
		}
		if err := writeToFile(certOutPath, res.SignedKey, 0644); err != nil {
			util.HandleError(err, "Failed to write SSH host certificate to file")
		}
		fmt.Println("📁 Wrote host certificate to:", certOutPath)
	}

	if configureSshd {
		sshdConfig := "/etc/ssh/sshd_config"
		contentBytes, err := os.ReadFile(sshdConfig)
		if err != nil {
			util.HandleError(err, "Failed to read sshd_config")
		}
		lines := strings.Split(string(contentBytes), "\n")

		configMap := map[string]string{
			"TrustedUserCAKeys": userCaOutFilePath,
			"HostKey":           hostPrivateKeyPath,
			"HostCertificate":   certOutPath,
		}

		seenKeys := map[string]bool{}
		for i, line := range lines {
			trimmed := strings.TrimSpace(line)
			for key, value := range configMap {
				if strings.HasPrefix(trimmed, key+" ") {
					seenKeys[key] = true
					if strings.HasPrefix(trimmed, "#") || forceOverwrite {
						lines[i] = fmt.Sprintf("%s %s", key, value)
					} else {
						util.PrintErrorMessageAndExit("sshd_config already contains: " + trimmed + ". Use --force to overwrite.")
					}
				}
			}
		}

		// Append missing lines
		for key, value := range configMap {
			if !seenKeys[key] {
				lines = append(lines, fmt.Sprintf("%s %s", key, value))
			}
		}

		// Write back to file
		if err := os.WriteFile(sshdConfig, []byte(strings.Join(lines, "\n")), 0644); err != nil {
			util.HandleError(err, "Failed to update sshd_config")
		}
		fmt.Println("📄 Updated sshd_config entries")
	}
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

	sshConnectCmd.Flags().String("token", "", "Use a machine identity access token")
	sshConnectCmd.Flags().Bool("write-host-ca-to-file", true, "Write Host CA public key to ~/.ssh/known_hosts as a separate entry if doesn't already exist")
	sshConnectCmd.Flags().String("hostname", "", "Hostname of the SSH host to connect to")
	sshConnectCmd.Flags().String("login-user", "", "Login user for the SSH connection")
	sshConnectCmd.Flags().String("out-file-path", "", "The path to write the SSH credentials to such as ~/.ssh, ./some_folder, ./some_folder/id_rsa-cert.pub. If not provided, the credentials will be added to the SSH agent and used to establish an interactive SSH connection")
	sshCmd.AddCommand(sshConnectCmd)

	sshAddHostCmd.Flags().String("token", "", "Use a machine identity access token")
	sshAddHostCmd.Flags().String("projectId", "", "Project ID the host belongs to (required)")
	sshAddHostCmd.Flags().String("hostname", "", "Hostname of the SSH host (required)")
	sshAddHostCmd.Flags().String("alias", "", "Alias for the SSH host")
	sshAddHostCmd.Flags().Bool("write-user-ca-to-file", false, "Write User CA public key to /etc/ssh/infisical_user_ca.pub")
	sshAddHostCmd.Flags().String("user-ca-out-file-path", "/etc/ssh/infisical_user_ca.pub", "Custom file path to write the User CA public key")
	sshAddHostCmd.Flags().Bool("write-host-cert-to-file", false, "Write SSH host certificate to /etc/ssh/ssh_host_<type>_key-cert.pub")
	sshAddHostCmd.Flags().Bool("configure-sshd", false, "Update `TrustedUserCAKeys`, `HostKey`, and `HostCertificate` in the `/etc/ssh/sshd_config` file")
	sshAddHostCmd.Flags().Bool("force", false, "Force overwrite of existing certificate files as part of `--write-user-ca-to-file` and `--write-host-cert-to-file`")

	sshCmd.AddCommand(sshAddHostCmd)

	rootCmd.AddCommand(sshCmd)
}
