package tests

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
)

const (
	CLI_NAME = "infisical-merge"
)

var (
	FORMATTED_CLI_NAME = fmt.Sprintf("./%s", CLI_NAME)
)

type Credentials struct {
	ClientID      string
	ClientSecret  string
	UAAccessToken string
	ServiceToken  string
	ProjectID     string
	EnvSlug       string
	UserEmail     string
	UserPassword  string
}

var creds = Credentials{
	UAAccessToken: "",
	ClientID:      os.Getenv("CLI_TESTS_UA_CLIENT_ID"),
	ClientSecret:  os.Getenv("CLI_TESTS_UA_CLIENT_SECRET"),
	ServiceToken:  os.Getenv("CLI_TESTS_SERVICE_TOKEN"),
	ProjectID:     os.Getenv("CLI_TESTS_PROJECT_ID"),
	EnvSlug:       os.Getenv("CLI_TESTS_ENV_SLUG"),
	UserEmail:     os.Getenv("CLI_TESTS_USER_EMAIL"),
	UserPassword:  os.Getenv("CLI_TESTS_USER_PASSWORD"),
}

func ExecuteCliCommand(command string, args ...string) (string, error) {
	cmd := exec.Command(command, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Println(fmt.Sprint(err) + ": " + string(output))
		return strings.TrimSpace(string(output)), err
	}
	return strings.TrimSpace(string(output)), nil
}

func SetupCli() {

	if creds.ClientID == "" || creds.ClientSecret == "" || creds.ServiceToken == "" || creds.ProjectID == "" || creds.EnvSlug == "" {
		panic("Missing required environment variables")
	}

	// check if the CLI is already built, if not build it
	alreadyBuilt := false
	if _, err := os.Stat(FORMATTED_CLI_NAME); err == nil {
		alreadyBuilt = true
	}

	if !alreadyBuilt {
		if err := exec.Command("go", "build", "../.").Run(); err != nil {
			log.Fatal(err)
		}
	}

}
