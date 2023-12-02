/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"bytes"
	"errors"
	"fmt"
	"io/ioutil"
	"os"
	"os/signal"
	"strings"
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
	Address string `yaml:"address"`
}

type AuthConfig struct {
	Type   string      `yaml:"type"`
	Config interface{} `yaml:"config"`
}

type TokenAuthConfig struct {
	TokenPath string `yaml:"token-path"`
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
	SourcePath      string `yaml:"source-path"`
	DestinationPath string `yaml:"destination-path"`
}

func ReadFile(filePath string) ([]byte, error) {
	return ioutil.ReadFile(filePath)
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

func ParseAgentConfig(filePath string) (*Config, error) {
	data, err := ioutil.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	var rawConfig struct {
		Infisical InfisicalConfig `yaml:"infisical"`
		Auth      struct {
			Type   string                 `yaml:"type"`
			Config map[string]interface{} `yaml:"config"`
		} `yaml:"auth"`
		Sinks     []Sink     `yaml:"sinks"`
		Templates []Template `yaml:"templates"`
	}

	if err := yaml.Unmarshal(data, &rawConfig); err != nil {
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
	case "token":
		var tokenConfig TokenAuthConfig
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

func secretTemplateFunction(accessToken string) func(string, string, string) ([]models.SingleEnvironmentVariable, error) {
	return func(projectID, envSlug, secretPath string) ([]models.SingleEnvironmentVariable, error) {
		secrets, err := util.GetPlainTextSecretsViaMachineIdentity(accessToken, projectID, envSlug, secretPath, false)
		if err != nil {
			return nil, err
		}

		return secrets, nil
	}
}

func ProcessTemplate(templatePath string, data interface{}, accessToken string) (*bytes.Buffer, error) {
	// custom template function to fetch secrets from Infisical
	secretFunction := secretTemplateFunction(accessToken)
	funcs := template.FuncMap{
		"secret": secretFunction,
	}

	tmpl, err := template.New(templatePath).Funcs(funcs).ParseFiles(templatePath)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return nil, err
	}

	return &buf, nil
}

func refreshTokenAndProcessTemplate(refreshToken string, config *Config, errChan chan error) {
	for {
		httpClient := resty.New()
		httpClient.SetRetryCount(10000).
			SetRetryMaxWaitTime(20 * time.Second).
			SetRetryWaitTime(5 * time.Second)

		tokenResponse, err := api.CallServiceTokenV3Refresh(httpClient, api.ServiceTokenV3RefreshTokenRequest{RefreshToken: refreshToken})
		if err != nil {
			errChan <- fmt.Errorf("unable to complete renewal because [%s]", err)
		}

		for _, sinkFile := range config.Sinks {
			if sinkFile.Type == "file" {
				err = ioutil.WriteFile(sinkFile.Config.Path, []byte(tokenResponse.AccessToken), 0644)
				if err != nil {
					errChan <- err
					return
				}
			} else {
				errChan <- errors.New("unsupported sink type. Only 'file' type is supported")
				return
			}
		}

		refreshToken = tokenResponse.RefreshToken
		nextRefreshCycle := time.Duration(tokenResponse.ExpiresIn-5) * time.Second // when the next access refresh will happen

		d, err := time.ParseDuration(nextRefreshCycle.String())
		if err != nil {
			errChan <- fmt.Errorf("unable to parse refresh time because %s", err)
			return
		}

		log.Info().Msgf("token refreshed and saved to selected path; next cycle will occur in %s", d.String())

		for _, secretTemplate := range config.Templates {
			processedTemplate, err := ProcessTemplate(secretTemplate.SourcePath, nil, tokenResponse.AccessToken)
			if err != nil {
				errChan <- err
				return
			}

			if err := WriteBytesToFile(processedTemplate, secretTemplate.DestinationPath); err != nil {
				errChan <- err
				return
			}

			log.Info().Msgf("secret template at path %s has been rendered and saved to path %s", secretTemplate.SourcePath, secretTemplate.DestinationPath)
		}

		time.Sleep(nextRefreshCycle)
	}
}

// runCmd represents the run command
var agentCmd = &cobra.Command{
	Example: `
	infisical agent
	`,
	Use:                   "agent",
	Short:                 "Used to launch a client daemon that streamlines authentication and secret retrieval processes in some environments",
	DisableFlagsInUseLine: true,
	Run: func(cmd *cobra.Command, args []string) {

		log.Info().Msg("starting Infisical agent...")

		configPath, err := cmd.Flags().GetString("config")
		if err != nil {
			util.HandleError(err, "Unable to parse flag config")
		}

		if !FileExists(configPath) {
			log.Error().Msgf("Unable to locate %s. The provided agent config file path is either missing or incorrect", configPath)
			return
		}

		agentConfig, err := ParseAgentConfig(configPath)
		if err != nil {
			log.Error().Msgf("Unable to prase %s because %v. Please ensure that is follows the Infisical Agent config structure", configPath, err)
			return
		}

		errChan := make(chan error)
		sigChan := make(chan os.Signal, 1)

		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

		switch configAuthType := agentConfig.Auth.Config.(type) {
		case TokenAuthConfig:
			content, err := ReadFile(configAuthType.TokenPath)
			if err != nil {
				log.Error().Msgf("unable to read initial token from file path %s because %v", configAuthType.TokenPath, err)
				return
			}

			refreshToken := string(content)
			go refreshTokenAndProcessTemplate(refreshToken, agentConfig, errChan)

		case OAuthConfig:
			// future auth types
		default:
			log.Error().Msgf("unknown auth config type. Only 'file' type is supported")
			return
		}

		select {
		case err := <-errChan:
			log.Fatal().Msgf("agent stopped due to error: %v", err)
			os.Exit(1)
		case <-sigChan:
			log.Info().Msg("agent is gracefully shutting...")
			os.Exit(1)
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
