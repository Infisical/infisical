package util

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path"
	"strings"

	"github.com/Infisical/infisical-merge/packages/models"
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

func GetInfisicalServiceToken(cmd *cobra.Command) (serviceToken string, err error) {
	infisicalToken, err := cmd.Flags().GetString("token")

	if infisicalToken == "" {
		infisicalToken = os.Getenv(INFISICAL_TOKEN_NAME)
	}

	if err != nil {
		return "", err
	}

	return infisicalToken, nil
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
