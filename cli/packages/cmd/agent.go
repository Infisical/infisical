/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"os/signal"
	"path"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"text/template"
	"time"

	"github.com/rs/zerolog/log"
	"gopkg.in/yaml.v2"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/go-resty/resty/v2"
	"github.com/spf13/cobra"
)

const DEFAULT_INFISICAL_CLOUD_URL = "https://app.infisical.com"

type Config struct {
	Infisical InfisicalConfig `yaml:"infisical"`
	Auth      AuthConfig      `yaml:"auth"`
	Sinks     []Sink          `yaml:"sinks"`
	Templates []Template      `yaml:"templates"`
}

type InfisicalConfig struct {
	Address       string `yaml:"address"`
	ExitAfterAuth bool   `yaml:"exit-after-auth"`
}

type AuthConfig struct {
	Type   string      `yaml:"type"`
	Config interface{} `yaml:"config"`
}

type UniversalAuth struct {
	ClientIDPath             string `yaml:"client-id"`
	ClientSecretPath         string `yaml:"client-secret"`
	RemoveClientSecretOnRead bool   `yaml:"remove_client_secret_on_read"`
}

type OAuthConfig struct {
	ClientID     string `yaml:"client-id"`
	ClientSecret string `yaml:"client-secret"`
}

type Sink struct {
	Type   string      `yaml:"type"`
	Config SinkDetails `yaml:"config"`
}

type SinkDetails struct {
	Path string `yaml:"path"`
}

type Template struct {
	SourcePath            string `yaml:"source-path"`
	Base64TemplateContent string `yaml:"base64-template-content"`
	DestinationPath       string `yaml:"destination-path"`

	Config struct { // Configurations for the template
		PollingInterval string `yaml:"polling-interval"` // How often to poll for changes in the secret
		Execute         struct {
			Command string `yaml:"command"` // Command to execute once the template has been rendered
			Timeout int64  `yaml:"timeout"` // Timeout for the command
		} `yaml:"execute"` // Command to execute once the template has been rendered
	} `yaml:"config"`
}

func ReadFile(filePath string) ([]byte, error) {
	return ioutil.ReadFile(filePath)
}

func ExecuteCommandWithTimeout(command string, timeout int64) error {

	shell := [2]string{"sh", "-c"}
	if runtime.GOOS == "windows" {
		shell = [2]string{"cmd", "/C"}
	} else {
		currentShell := os.Getenv("SHELL")
		if currentShell != "" {
			shell[0] = currentShell
		}
	}

	ctx := context.Background()
	if timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
		defer cancel()
	}

	cmd := exec.CommandContext(ctx, shell[0], shell[1], command)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		if exitError, ok := err.(*exec.ExitError); ok { // type assertion
			if exitError.ProcessState.ExitCode() == -1 {
				return fmt.Errorf("command timed out")
			}
		}
		return err
	} else {
		return nil
	}
}

func FileExists(filepath string) bool {
	info, err := os.Stat(filepath)
	if os.IsNotExist(err) {
		return false
	}
	return !info.IsDir()
}

// WriteToFile writes data to the specified file path.
func WriteBytesToFile(data *bytes.Buffer, outputPath string) error {
	outputFile, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer outputFile.Close()

	_, err = outputFile.Write(data.Bytes())
	return err
}

func appendAPIEndpoint(address string) string {
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

func ParseAgentConfig(configFile []byte) (*Config, error) {
	var rawConfig struct {
		Infisical InfisicalConfig `yaml:"infisical"`
		Auth      struct {
			Type   string                 `yaml:"type"`
			Config map[string]interface{} `yaml:"config"`
		} `yaml:"auth"`
		Sinks     []Sink     `yaml:"sinks"`
		Templates []Template `yaml:"templates"`
	}

	if err := yaml.Unmarshal(configFile, &rawConfig); err != nil {
		return nil, err
	}

	// Set defaults
	if rawConfig.Infisical.Address == "" {
		rawConfig.Infisical.Address = DEFAULT_INFISICAL_CLOUD_URL
	}

	config.INFISICAL_URL = appendAPIEndpoint(rawConfig.Infisical.Address)

	log.Info().Msgf("Infisical instance address set to %s", rawConfig.Infisical.Address)

	config := &Config{
		Infisical: rawConfig.Infisical,
		Auth: AuthConfig{
			Type: rawConfig.Auth.Type,
		},
		Sinks:     rawConfig.Sinks,
		Templates: rawConfig.Templates,
	}

	// Marshal and then unmarshal the config based on the type
	configBytes, err := yaml.Marshal(rawConfig.Auth.Config)
	if err != nil {
		return nil, err
	}

	switch rawConfig.Auth.Type {
	case "universal-auth":
		var tokenConfig UniversalAuth
		if err := yaml.Unmarshal(configBytes, &tokenConfig); err != nil {
			return nil, err
		}

		config.Auth.Config = tokenConfig
	case "oauth": // aws, gcp, k8s service account, etc
		var oauthConfig OAuthConfig
		if err := yaml.Unmarshal(configBytes, &oauthConfig); err != nil {
			return nil, err
		}
		config.Auth.Config = oauthConfig
	default:
		return nil, fmt.Errorf("unknown auth type: %s", rawConfig.Auth.Type)
	}

	return config, nil
}

func secretTemplateFunction(accessToken string, existingEtag string, currentEtag *string) func(string, string, string) ([]models.SingleEnvironmentVariable, error) {
	return func(projectID, envSlug, secretPath string) ([]models.SingleEnvironmentVariable, error) {

		res, err := util.GetPlainTextSecretsViaMachineIdentity(accessToken, projectID, envSlug, secretPath, false, false)

		if err != nil {
			return nil, err
		}

		if existingEtag != res.Etag {
			*currentEtag = res.Etag
		}

		return res.Secrets, nil
	}
}

func ProcessTemplate(templatePath string, data interface{}, accessToken string, existingEtag string, currentEtag *string) (*bytes.Buffer, error) {
	// custom template function to fetch secrets from Infisical
	secretFunction := secretTemplateFunction(accessToken, existingEtag, currentEtag)
	funcs := template.FuncMap{
		"secret": secretFunction,
	}

	templateName := path.Base(templatePath)

	tmpl, err := template.New(templateName).Funcs(funcs).ParseFiles(templatePath)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return nil, err
	}

	return &buf, nil
}

func ProcessBase64Template(encodedTemplate string, data interface{}, accessToken string, existingEtag string, currentEtag *string) (*bytes.Buffer, error) {
	// custom template function to fetch secrets from Infisical
	decoded, err := base64.StdEncoding.DecodeString(encodedTemplate)
	if err != nil {
		return nil, err
	}

	templateString := string(decoded)

	secretFunction := secretTemplateFunction(accessToken, existingEtag, currentEtag) // TODO: Fix this
	funcs := template.FuncMap{
		"secret": secretFunction,
	}

	templateName := "base64Template"

	tmpl, err := template.New(templateName).Funcs(funcs).Parse(templateString)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return nil, err
	}

	return &buf, nil
}

type TokenManager struct {
	accessToken                    string
	accessTokenTTL                 time.Duration
	accessTokenMaxTTL              time.Duration
	accessTokenFetchedTime         time.Time
	accessTokenRefreshedTime       time.Time
	mutex                          sync.Mutex
	filePaths                      []Sink // Store file paths if needed
	templates                      []Template
	clientIdPath                   string
	clientSecretPath               string
	newAccessTokenNotificationChan chan bool
	removeClientSecretOnRead       bool
	cachedClientSecret             string
	exitAfterAuth                  bool
}

func NewTokenManager(fileDeposits []Sink, templates []Template, clientIdPath string, clientSecretPath string, newAccessTokenNotificationChan chan bool, removeClientSecretOnRead bool, exitAfterAuth bool) *TokenManager {
	return &TokenManager{
		filePaths:                      fileDeposits,
		templates:                      templates,
		clientIdPath:                   clientIdPath,
		clientSecretPath:               clientSecretPath,
		newAccessTokenNotificationChan: newAccessTokenNotificationChan,
		removeClientSecretOnRead:       removeClientSecretOnRead,
		exitAfterAuth:                  exitAfterAuth,
	}

}

func (tm *TokenManager) SetToken(token string, accessTokenTTL time.Duration, accessTokenMaxTTL time.Duration) {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	tm.accessToken = token
	tm.accessTokenTTL = accessTokenTTL
	tm.accessTokenMaxTTL = accessTokenMaxTTL

	tm.newAccessTokenNotificationChan <- true
}

func (tm *TokenManager) GetToken() string {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	return tm.accessToken
}

// Fetches a new access token using client credentials
func (tm *TokenManager) FetchNewAccessToken() error {
	clientID := os.Getenv("INFISICAL_UNIVERSAL_AUTH_CLIENT_ID")
	if clientID == "" {
		clientIDAsByte, err := ReadFile(tm.clientIdPath)
		if err != nil {
			return fmt.Errorf("unable to read client id from file path '%s' due to error: %v", tm.clientIdPath, err)
		}
		clientID = string(clientIDAsByte)
	}

	clientSecret := os.Getenv("INFISICAL_UNIVERSAL_CLIENT_SECRET")
	if clientSecret == "" {
		clientSecretAsByte, err := ReadFile(tm.clientSecretPath)
		if err != nil {
			if len(tm.cachedClientSecret) == 0 {
				return fmt.Errorf("unable to read client secret from file and no cached client secret found: %v", err)
			} else {
				clientSecretAsByte = []byte(tm.cachedClientSecret)
			}
		}
		clientSecret = string(clientSecretAsByte)
	}

	// remove client secret after first read
	if tm.removeClientSecretOnRead {
		os.Remove(tm.clientSecretPath)
	}

	// save as cache in memory
	tm.cachedClientSecret = clientSecret

	err, loginResponse := universalAuthLogin(clientID, clientSecret)
	if err != nil {
		return err
	}

	accessTokenTTL := time.Duration(loginResponse.AccessTokenTTL * int(time.Second))
	accessTokenMaxTTL := time.Duration(loginResponse.AccessTokenMaxTTL * int(time.Second))

	if accessTokenTTL <= time.Duration(5)*time.Second {
		util.PrintErrorMessageAndExit("At this this, agent does not support refresh of tokens with 5 seconds or less ttl. Please increase access token ttl and try again")
	}

	tm.accessTokenFetchedTime = time.Now()
	tm.SetToken(loginResponse.AccessToken, accessTokenTTL, accessTokenMaxTTL)

	return nil
}

// Refreshes the existing access token
func (tm *TokenManager) RefreshAccessToken() error {
	httpClient := resty.New()
	httpClient.SetRetryCount(10000).
		SetRetryMaxWaitTime(20 * time.Second).
		SetRetryWaitTime(5 * time.Second)

	accessToken := tm.GetToken()
	response, err := api.CallUniversalAuthRefreshAccessToken(httpClient, api.UniversalAuthRefreshRequest{AccessToken: accessToken})
	if err != nil {
		return err
	}

	accessTokenTTL := time.Duration(response.AccessTokenTTL * int(time.Second))
	accessTokenMaxTTL := time.Duration(response.AccessTokenMaxTTL * int(time.Second))
	tm.accessTokenRefreshedTime = time.Now()

	tm.SetToken(response.AccessToken, accessTokenTTL, accessTokenMaxTTL)

	return nil
}

func (tm *TokenManager) ManageTokenLifecycle() {
	for {
		accessTokenMaxTTLExpiresInTime := tm.accessTokenFetchedTime.Add(tm.accessTokenMaxTTL - (5 * time.Second))
		accessTokenRefreshedTime := tm.accessTokenRefreshedTime

		if accessTokenRefreshedTime.IsZero() {
			accessTokenRefreshedTime = tm.accessTokenFetchedTime
		}

		nextAccessTokenExpiresInTime := accessTokenRefreshedTime.Add(tm.accessTokenTTL - (5 * time.Second))

		if tm.accessTokenFetchedTime.IsZero() && tm.accessTokenRefreshedTime.IsZero() {
			// case: init login to get access token
			log.Info().Msg("attempting to authenticate...")
			err := tm.FetchNewAccessToken()
			if err != nil {
				log.Error().Msgf("unable to authenticate because %v. Will retry in 30 seconds", err)

				// wait a bit before trying again
				time.Sleep((30 * time.Second))
				continue
			}
		} else if time.Now().After(accessTokenMaxTTLExpiresInTime) {
			log.Info().Msgf("token has reached max ttl, attempting to re authenticate...")
			err := tm.FetchNewAccessToken()
			if err != nil {
				log.Error().Msgf("unable to authenticate because %v. Will retry in 30 seconds", err)

				// wait a bit before trying again
				time.Sleep((30 * time.Second))
				continue
			}
		} else {
			log.Info().Msgf("attempting to refresh existing token...")
			err := tm.RefreshAccessToken()
			if err != nil {
				log.Error().Msgf("unable to refresh token because %v. Will retry in 30 seconds", err)

				// wait a bit before trying again
				time.Sleep((30 * time.Second))
				continue
			}
		}

		if tm.exitAfterAuth {
			time.Sleep(25 * time.Second)
			os.Exit(0)
		}

		if accessTokenRefreshedTime.IsZero() {
			accessTokenRefreshedTime = tm.accessTokenFetchedTime
		} else {
			accessTokenRefreshedTime = tm.accessTokenRefreshedTime
		}

		nextAccessTokenExpiresInTime = accessTokenRefreshedTime.Add(tm.accessTokenTTL - (5 * time.Second))
		accessTokenMaxTTLExpiresInTime = tm.accessTokenFetchedTime.Add(tm.accessTokenMaxTTL - (5 * time.Second))

		if nextAccessTokenExpiresInTime.After(accessTokenMaxTTLExpiresInTime) {
			// case: Refreshed so close that the next refresh would occur beyond max ttl (this is because currently, token renew tries to add +access-token-ttl amount of time)
			// example: access token ttl is 11 sec and max ttl is 30 sec. So it will start with 11 seconds, then 22 seconds but the next time you call refresh it would try to extend it to 33 but max ttl only allows 30, so the token will be valid until 30 before we need to reauth
			time.Sleep(tm.accessTokenTTL - nextAccessTokenExpiresInTime.Sub(accessTokenMaxTTLExpiresInTime))
		} else {
			time.Sleep(tm.accessTokenTTL - (5 * time.Second))
		}
	}
}

func (tm *TokenManager) WriteTokenToFiles() {
	token := tm.GetToken()
	for _, sinkFile := range tm.filePaths {
		if sinkFile.Type == "file" {
			err := ioutil.WriteFile(sinkFile.Config.Path, []byte(token), 0644)
			if err != nil {
				log.Error().Msgf("unable to write file sink to path '%s' because %v", sinkFile.Config.Path, err)
			}

			log.Info().Msgf("new access token saved to file at path '%s'", sinkFile.Config.Path)

		} else {
			log.Error().Msg("unsupported sink type. Only 'file' type is supported")
		}
	}
}

func (tm *TokenManager) WriteTemplateToFile(bytes *bytes.Buffer, template *Template) {
	if err := WriteBytesToFile(bytes, template.DestinationPath); err != nil {
		log.Error().Msgf("template engine: unable to write secrets to path because %s. Will try again on next cycle", err)
		return
	}
	log.Info().Msgf("template engine: secret template at path %s has been rendered and saved to path %s", template.SourcePath, template.DestinationPath)
}

func (tm *TokenManager) MonitorSecretChanges(secretTemplate Template, sigChan chan os.Signal) {

	pollingInterval := time.Duration(5 * time.Minute)

	if secretTemplate.Config.PollingInterval != "" {
		interval, err := util.ConvertPollingIntervalToTime(secretTemplate.Config.PollingInterval)

		if err != nil {
			log.Error().Msgf("unable to convert polling interval to time because %v", err)
			sigChan <- syscall.SIGINT
			return

		} else {
			pollingInterval = interval
		}
	}

	var existingEtag string
	var currentEtag string
	var firstRun = true

	execTimeout := secretTemplate.Config.Execute.Timeout
	execCommand := secretTemplate.Config.Execute.Command

	for {
		token := tm.GetToken()

		if token != "" {

			var processedTemplate *bytes.Buffer
			var err error

			if secretTemplate.SourcePath != "" {
				processedTemplate, err = ProcessTemplate(secretTemplate.SourcePath, nil, token, existingEtag, &currentEtag)
			} else {
				processedTemplate, err = ProcessBase64Template(secretTemplate.Base64TemplateContent, nil, token, existingEtag, &currentEtag)
			}

			if err != nil {
				log.Error().Msgf("unable to process template because %v", err)
			} else {
				if (existingEtag != currentEtag) || firstRun {

					tm.WriteTemplateToFile(processedTemplate, &secretTemplate)
					existingEtag = currentEtag

					if !firstRun && execCommand != "" {
						log.Info().Msgf("executing command: %s", execCommand)
						err := ExecuteCommandWithTimeout(execCommand, execTimeout)

						if err != nil {
							log.Error().Msgf("unable to execute command because %v", err)
						}

					}
					if firstRun {
						firstRun = false
					}
				}
			}
			time.Sleep(pollingInterval)
		} else {
			// It fails to get the access token. So we will re-try in 3 seconds. We do this because if we don't, the user will have to wait for the next polling interval to get the first secret render.
			time.Sleep(3 * time.Second)
		}

	}
}

func universalAuthLogin(clientId string, clientSecret string) (error, api.UniversalAuthLoginResponse) {
	httpClient := resty.New()
	httpClient.SetRetryCount(10000).
		SetRetryMaxWaitTime(20 * time.Second).
		SetRetryWaitTime(5 * time.Second)

	tokenResponse, err := api.CallUniversalAuthLogin(httpClient, api.UniversalAuthLoginRequest{ClientId: clientId, ClientSecret: clientSecret})
	if err != nil {
		return err, api.UniversalAuthLoginResponse{}
	}

	return nil, tokenResponse
}

// runCmd represents the run command
var agentCmd = &cobra.Command{
	Example: `
	infisical agent
	`,
	Use:                   "agent",
	Short:                 "Used to launch a client daemon that streamlines authentication and secret retrieval processes in various environments",
	DisableFlagsInUseLine: true,
	Run: func(cmd *cobra.Command, args []string) {

		log.Info().Msg("starting Infisical agent...")

		configPath, err := cmd.Flags().GetString("config")
		if err != nil {
			util.HandleError(err, "Unable to parse flag config")
		}

		var agentConfigInBytes []byte

		agentConfigInBase64 := os.Getenv("INFISICAL_AGENT_CONFIG_BASE64")

		if agentConfigInBase64 == "" {
			data, err := ioutil.ReadFile(configPath)
			if err != nil {
				if !FileExists(configPath) {
					log.Error().Msgf("Unable to locate %s. The provided agent config file path is either missing or incorrect", configPath)
					return
				}
			}
			agentConfigInBytes = data
		}

		if agentConfigInBase64 != "" {
			decodedAgentConfig, err := base64.StdEncoding.DecodeString(agentConfigInBase64)
			if err != nil {
				log.Error().Msgf("Unable to decode base64 config file because %v", err)
				return
			}

			agentConfigInBytes = decodedAgentConfig
		}

		if !FileExists(configPath) && agentConfigInBase64 == "" {
			log.Error().Msgf("No agent config file provided. Please provide a agent config file", configPath)
			return
		}

		agentConfig, err := ParseAgentConfig(agentConfigInBytes)
		if err != nil {
			log.Error().Msgf("Unable to prase %s because %v. Please ensure that is follows the Infisical Agent config structure", configPath, err)
			return
		}

		if agentConfig.Auth.Type != "universal-auth" {
			util.PrintErrorMessageAndExit("Only auth type of 'universal-auth' is supported at this time")
		}

		configUniversalAuthType := agentConfig.Auth.Config.(UniversalAuth)

		tokenRefreshNotifier := make(chan bool)
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

		filePaths := agentConfig.Sinks
		tm := NewTokenManager(filePaths, agentConfig.Templates, configUniversalAuthType.ClientIDPath, configUniversalAuthType.ClientSecretPath, tokenRefreshNotifier, configUniversalAuthType.RemoveClientSecretOnRead, agentConfig.Infisical.ExitAfterAuth)

		go tm.ManageTokenLifecycle()

		for i, template := range agentConfig.Templates {
			log.Info().Msgf("template engine started for template %v...", i+1)
			go tm.MonitorSecretChanges(template, sigChan)
		}

		for {
			select {
			case <-tokenRefreshNotifier:
				go tm.WriteTokenToFiles()
			case <-sigChan:
				log.Info().Msg("agent is gracefully shutting...")
				// TODO: check if we are in the middle of writing files to disk
				os.Exit(1)
			}
		}

	},
}

func init() {
	agentCmd.SetHelpFunc(func(command *cobra.Command, strings []string) {
		command.Flags().MarkHidden("domain")
		command.Parent().HelpFunc()(command, strings)
	})
	agentCmd.Flags().String("config", "agent-config.yaml", "The path to agent config yaml file")
	rootCmd.AddCommand(agentCmd)
}
