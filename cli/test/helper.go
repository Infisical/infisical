package tests

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"regexp"
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
		fmt.Println(fmt.Sprint(err) + ": " + FilterRequestID(strings.TrimSpace(string(output))))
		return FilterRequestID(strings.TrimSpace(string(output))), err
	}
	return FilterRequestID(strings.TrimSpace(string(output))), nil
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

func FilterRequestID(input string) string {
	requestIDPattern := regexp.MustCompile(`\[request-id=[^\]]+\]`)
	reqIDPattern := regexp.MustCompile(`\[reqId=[^\]]+\]`)
	input = requestIDPattern.ReplaceAllString(input, "[request-id=<unknown-value>]")
	input = reqIDPattern.ReplaceAllString(input, "[reqId=<unknown-value>]")

	start := strings.Index(input, "{")
	end := strings.LastIndex(input, "}") + 1

	if start == -1 || end == -1 {
		return input
	}

	jsonPart := input[:start] // Pre-JSON content

	// Parse the JSON object
	var errorObj map[string]interface{}
	if err := json.Unmarshal([]byte(input[start:end]), &errorObj); err != nil {
		return input
	}

	// Remove requestId field
	delete(errorObj, "requestId")
	delete(errorObj, "reqId")

	// Convert back to JSON
	filtered, err := json.Marshal(errorObj)
	if err != nil {
		return input
	}

	// Reconstruct the full string
	return jsonPart + string(filtered) + input[end:]
}
