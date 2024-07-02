package util

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/go-resty/resty/v2"
	"github.com/spf13/cobra"
)

type DecodedSymmetricEncryptionDetails = struct {
	Cipher []byte
	IV     []byte
	Tag    []byte
	Key    []byte
}

func GetBase64DecodedSymmetricEncryptionDetails(key string, cipher string, IV string, tag string) (DecodedSymmetricEncryptionDetails, error) {
	cipherx, err := base64.StdEncoding.DecodeString(cipher)
	if err != nil {
		return DecodedSymmetricEncryptionDetails{}, fmt.Errorf("Base64DecodeSymmetricEncryptionDetails: Unable to decode cipher text [err=%v]", err)
	}

	keyx, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		return DecodedSymmetricEncryptionDetails{}, fmt.Errorf("Base64DecodeSymmetricEncryptionDetails: Unable to decode key [err=%v]", err)
	}

	IVx, err := base64.StdEncoding.DecodeString(IV)
	if err != nil {
		return DecodedSymmetricEncryptionDetails{}, fmt.Errorf("Base64DecodeSymmetricEncryptionDetails: Unable to decode IV [err=%v]", err)
	}

	tagx, err := base64.StdEncoding.DecodeString(tag)
	if err != nil {
		return DecodedSymmetricEncryptionDetails{}, fmt.Errorf("Base64DecodeSymmetricEncryptionDetails: Unable to decode tag [err=%v]", err)
	}

	return DecodedSymmetricEncryptionDetails{
		Key:    keyx,
		Cipher: cipherx,
		IV:     IVx,
		Tag:    tagx,
	}, nil
}

// Helper function to sort the secrets by key so we can create a consistent output
func SortSecretsByKeys(secrets []models.SingleEnvironmentVariable) []models.SingleEnvironmentVariable {
	sort.Slice(secrets, func(i, j int) bool {
		return secrets[i].Key < secrets[j].Key
	})
	return secrets
}

func IsSecretEnvironmentValid(env string) bool {
	if env == "prod" || env == "dev" || env == "test" || env == "staging" {
		return true
	}
	return false
}

func IsSecretTypeValid(s string) bool {
	if s == "personal" || s == "shared" {
		return true
	}
	return false
}

func GetInfisicalToken(cmd *cobra.Command) (token *models.TokenDetails, err error) {
	infisicalToken, err := cmd.Flags().GetString("token")

	if err != nil {
		return nil, err
	}

	if infisicalToken == "" { // If no flag is passed, we first check for the universal auth access token env variable.
		infisicalToken = os.Getenv(INFISICAL_UNIVERSAL_AUTH_ACCESS_TOKEN_NAME)
	}

	if infisicalToken == "" { // If it's still empty after the first env check, we check for the service token env variable.
		infisicalToken = os.Getenv(INFISICAL_TOKEN_NAME)
	}

	if infisicalToken == "" { // If it's still empty after the second env check, we try to login with universal auth.
		clientId := os.Getenv(INFISICAL_UNIVERSAL_AUTH_CLIENT_ID_NAME)
		if clientId == "" {
			PrintErrorMessageAndExit("Please provide client-id")
		}
		clientSecret := os.Getenv(INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET_NAME)
		if clientSecret == "" {
			PrintErrorMessageAndExit("Please provide client-secret")
		}

		res, err := UniversalAuthLogin(clientId, clientSecret)

		if err != nil {
			HandleError(err)
		}

		infisicalToken = res.AccessToken
	}

	if infisicalToken == "" { // If it's empty, we return nothing at all.
		return nil, nil
	}

	if strings.HasPrefix(infisicalToken, "st.") {
		return &models.TokenDetails{
			Type:  SERVICE_TOKEN_IDENTIFIER,
			Token: infisicalToken,
		}, nil
	}

	return &models.TokenDetails{
		Type:  UNIVERSAL_AUTH_TOKEN_IDENTIFIER,
		Token: infisicalToken,
	}, nil

}

func UniversalAuthLogin(clientId string, clientSecret string) (api.UniversalAuthLoginResponse, error) {
	httpClient := resty.New()
	httpClient.SetRetryCount(10000).
		SetRetryMaxWaitTime(20 * time.Second).
		SetRetryWaitTime(5 * time.Second)

	tokenResponse, err := api.CallUniversalAuthLogin(httpClient, api.UniversalAuthLoginRequest{ClientId: clientId, ClientSecret: clientSecret})
	if err != nil {
		return api.UniversalAuthLoginResponse{}, err
	}

	return tokenResponse, nil
}

func RenewMachineIdentityAccessToken(accessToken string) (string, error) {

	httpClient := resty.New()
	httpClient.SetRetryCount(10000).
		SetRetryMaxWaitTime(20 * time.Second).
		SetRetryWaitTime(5 * time.Second)

	request := api.UniversalAuthRefreshRequest{
		AccessToken: accessToken,
	}

	tokenResponse, err := api.CallMachineIdentityRefreshAccessToken(httpClient, request)
	if err != nil {
		return "", err
	}

	return tokenResponse.AccessToken, nil
}

// Checks if the passed in email already exists in the users slice
func ConfigContainsEmail(users []models.LoggedInUser, email string) bool {
	for _, value := range users {
		if value.Email == email {
			return true
		}
	}
	return false
}

func RequireLogin() {
	// get the config file that stores the current logged in user email
	configFile, _ := GetConfigFile()

	if configFile.LoggedInUserEmail == "" {
		PrintErrorMessageAndExit("You must be logged in to run this command. To login, run [infisical login]")
	}
}

func IsLoggedIn() bool {
	configFile, _ := GetConfigFile()
	return configFile.LoggedInUserEmail != ""
}

func RequireServiceToken() {
	serviceToken := os.Getenv(INFISICAL_TOKEN_NAME)
	if serviceToken == "" {
		PrintErrorMessageAndExit("No service token is found in your terminal")
	}
}

func RequireLocalWorkspaceFile() {
	workspaceFilePath, _ := FindWorkspaceConfigFile()
	if workspaceFilePath == "" {
		PrintErrorMessageAndExit("It looks you have not yet connected this project to Infisical", "To do so, run [infisical init] then run your command again")
	}

	workspaceFile, err := GetWorkSpaceFromFile()
	if err != nil {
		HandleError(err, "Unable to read your project configuration, please try initializing this project again.", "Run [infisical init]")
	}

	if workspaceFile.WorkspaceId == "" {
		PrintErrorMessageAndExit("Your project id is missing in your local config file. Please add it or run again [infisical init]")
	}
}

func ValidateWorkspaceFile(projectConfigFilePath string) {
	workspaceFilePath, err := GetWorkSpaceFromFilePath(projectConfigFilePath)
	if err != nil {
		PrintErrorMessageAndExit(fmt.Sprintf("error reading your project config %v", err))
	}

	if workspaceFilePath.WorkspaceId == "" {
		PrintErrorMessageAndExit("Your project id is missing in your local config file. Please add it or run again [infisical init]")
	}
}

func GetHashFromStringList(list []string) string {
	hash := sha256.New()

	for _, item := range list {
		hash.Write([]byte(item))
	}

	sum := sha256.Sum256(hash.Sum(nil))
	return fmt.Sprintf("%x", sum)
}

// execCmd is a struct that holds the command and arguments to be executed.
// By using this struct, we can easily mock the command and arguments.
type execCmd struct {
	cmd  string
	args []string
}

var getCurrentBranchCmd = execCmd{
	cmd:  "git",
	args: []string{"symbolic-ref", "--short", "HEAD"},
}

func getCurrentBranch() (string, error) {
	cmd := exec.Command(getCurrentBranchCmd.cmd, getCurrentBranchCmd.args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	err := cmd.Run()
	if err != nil {
		return "", err
	}
	return path.Base(strings.TrimSpace(out.String())), nil
}

func AppendAPIEndpoint(address string) string {
	// Ensure the address does not already end with "/api"
	if strings.HasSuffix(address, "/api") {
		return address
	}

	// Check if the address ends with a slash and append accordingly
	if address[len(address)-1] == '/' {
		return address + "api"
	}
	return address + "/api"
}

func ReadFileAsString(filePath string) (string, error) {
	fileBytes, err := os.ReadFile(filePath)

	if err != nil {
		return "", err
	}

	return string(fileBytes), nil

}

func GetEnvVarOrFileContent(envName string, filePath string) (string, error) {
	// First check if the environment variable is set
	if envVarValue := os.Getenv(envName); envVarValue != "" {
		return envVarValue, nil
	}

	// If it's not set, try to read the file
	fileContent, err := ReadFileAsString(filePath)

	if err != nil {
		return "", fmt.Errorf("unable to read file content from file path '%s' [err=%v]", filePath, err)
	}

	return fileContent, nil
}

func GetCmdFlagOrEnv(cmd *cobra.Command, flag, envName string) (string, error) {
	value, flagsErr := cmd.Flags().GetString(flag)
	if flagsErr != nil {
		return "", flagsErr
	}
	if value == "" {
		value = os.Getenv(envName)
	}
	if value == "" {
		return "", fmt.Errorf("please provide %s flag", flag)
	}
	return value, nil
}
