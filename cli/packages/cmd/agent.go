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
	"slices"
	"sync"
	"syscall"
	"text/template"
	"time"

	infisicalSdk "github.com/infisical/go-sdk"
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

// duration to reduce from expiry of dynamic leases so that it gets triggered before expiry
const DYNAMIC_SECRET_PRUNE_EXPIRE_BUFFER = -15

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

type KubernetesAuth struct {
	IdentityID          string `yaml:"identity-id"`
	ServiceAccountToken string `yaml:"service-account-token"`
}

type AzureAuth struct {
	IdentityID string `yaml:"identity-id"`
}

type GcpIdTokenAuth struct {
	IdentityID string `yaml:"identity-id"`
}

type GcpIamAuth struct {
	IdentityID        string `yaml:"identity-id"`
	ServiceAccountKey string `yaml:"service-account-key"`
}

type AwsIamAuth struct {
	IdentityID string `yaml:"identity-id"`
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

type DynamicSecretLease struct {
	LeaseID     string
	ExpireAt    time.Time
	Environment string
	SecretPath  string
	Slug        string
	ProjectSlug string
	Data        map[string]interface{}
	TemplateIDs []int
}

type DynamicSecretLeaseManager struct {
	leases []DynamicSecretLease
	mutex  sync.Mutex
}

func (d *DynamicSecretLeaseManager) Prune() {
	d.mutex.Lock()
	defer d.mutex.Unlock()

	d.leases = slices.DeleteFunc(d.leases, func(s DynamicSecretLease) bool {
		return time.Now().After(s.ExpireAt.Add(DYNAMIC_SECRET_PRUNE_EXPIRE_BUFFER * time.Second))
	})
}

func (d *DynamicSecretLeaseManager) Append(lease DynamicSecretLease) {
	d.mutex.Lock()
	defer d.mutex.Unlock()

	index := slices.IndexFunc(d.leases, func(s DynamicSecretLease) bool {
		if lease.SecretPath == s.SecretPath && lease.Environment == s.Environment && lease.ProjectSlug == s.ProjectSlug && lease.Slug == s.Slug {
			return true
		}
		return false
	})

	if index != -1 {
		d.leases[index].TemplateIDs = append(d.leases[index].TemplateIDs, lease.TemplateIDs...)
		return
	}
	d.leases = append(d.leases, lease)
}

func (d *DynamicSecretLeaseManager) RegisterTemplate(projectSlug, environment, secretPath, slug string, templateId int) {
	d.mutex.Lock()
	defer d.mutex.Unlock()

	index := slices.IndexFunc(d.leases, func(lease DynamicSecretLease) bool {
		if lease.SecretPath == secretPath && lease.Environment == environment && lease.ProjectSlug == projectSlug && lease.Slug == slug {
			return true
		}
		return false
	})

	if index != -1 {
		d.leases[index].TemplateIDs = append(d.leases[index].TemplateIDs, templateId)
	}
}

func (d *DynamicSecretLeaseManager) GetLease(projectSlug, environment, secretPath, slug string) *DynamicSecretLease {
	d.mutex.Lock()
	defer d.mutex.Unlock()

	for _, lease := range d.leases {
		if lease.SecretPath == secretPath && lease.Environment == environment && lease.ProjectSlug == projectSlug && lease.Slug == slug {
			return &lease
		}
	}

	return nil
}

// for a given template find the first expiring lease
// The bool indicates whether it contains valid expiry list
func (d *DynamicSecretLeaseManager) GetFirstExpiringLeaseTime(templateId int) (time.Time, bool) {
	d.mutex.Lock()
	defer d.mutex.Unlock()

	if len(d.leases) == 0 {
		return time.Time{}, false
	}

	var firstExpiry time.Time
	for i, el := range d.leases {
		if i == 0 {
			firstExpiry = el.ExpireAt
		}
		newLeaseTime := el.ExpireAt.Add(DYNAMIC_SECRET_PRUNE_EXPIRE_BUFFER * time.Second)
		if newLeaseTime.Before(firstExpiry) {
			firstExpiry = newLeaseTime
		}
	}
	return firstExpiry, true
}

func NewDynamicSecretLeaseManager(sigChan chan os.Signal) *DynamicSecretLeaseManager {
	manager := &DynamicSecretLeaseManager{}
	return manager
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

func ParseAuthConfig(authConfigFile []byte, destination interface{}) error {
	if err := yaml.Unmarshal(authConfigFile, destination); err != nil {
		return err
	}

	return nil
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

	config.INFISICAL_URL = util.AppendAPIEndpoint(rawConfig.Infisical.Address)

	log.Info().Msgf("Infisical instance address set to %s", rawConfig.Infisical.Address)

	config := &Config{
		Infisical: rawConfig.Infisical,
		Auth: AuthConfig{
			Type:   rawConfig.Auth.Type,
			Config: rawConfig.Auth.Config,
		},
		Sinks:     rawConfig.Sinks,
		Templates: rawConfig.Templates,
	}

	return config, nil
}

func secretTemplateFunction(accessToken string, existingEtag string, currentEtag *string) func(string, string, string) ([]models.SingleEnvironmentVariable, error) {
	return func(projectID, envSlug, secretPath string) ([]models.SingleEnvironmentVariable, error) {
		res, err := util.GetPlainTextSecretsV3(accessToken, projectID, envSlug, secretPath, false, false)
		if err != nil {
			return nil, err
		}

		if existingEtag != res.Etag {
			*currentEtag = res.Etag
		}

		expandedSecrets := util.ExpandSecrets(res.Secrets, models.ExpandSecretsAuthentication{UniversalAuthAccessToken: accessToken}, "")

		return expandedSecrets, nil
	}
}

func getSingleSecretTemplateFunction(accessToken string, existingEtag string, currentEtag *string) func(string, string, string, string) (models.SingleEnvironmentVariable, error) {
	return func(projectID, envSlug, secretPath, secretName string) (models.SingleEnvironmentVariable, error) {
		secret, requestEtag, err := util.GetSinglePlainTextSecretByNameV3(accessToken, projectID, envSlug, secretPath, secretName)
		if err != nil {
			return models.SingleEnvironmentVariable{}, err
		}

		if existingEtag != requestEtag {
			*currentEtag = requestEtag
		}

		return secret, nil
	}
}

func dynamicSecretTemplateFunction(accessToken string, dynamicSecretManager *DynamicSecretLeaseManager, templateId int) func(...string) (map[string]interface{}, error) {
	return func(args ...string) (map[string]interface{}, error) {
		argLength := len(args)
		if argLength != 4 && argLength != 5 {
			return nil, fmt.Errorf("invalid arguments found for dynamic-secret function. Check template %d", templateId)
		}

		projectSlug, envSlug, secretPath, slug, ttl := args[0], args[1], args[2], args[3], ""
		if argLength == 5 {
			ttl = args[4]
		}
		dynamicSecretData := dynamicSecretManager.GetLease(projectSlug, envSlug, secretPath, slug)
		if dynamicSecretData != nil {
			dynamicSecretManager.RegisterTemplate(projectSlug, envSlug, secretPath, slug, templateId)
			return dynamicSecretData.Data, nil
		}

		res, err := util.CreateDynamicSecretLease(accessToken, projectSlug, envSlug, secretPath, slug, ttl)
		if err != nil {
			return nil, err
		}

		dynamicSecretManager.Append(DynamicSecretLease{LeaseID: res.Lease.Id, ExpireAt: res.Lease.ExpireAt, Environment: envSlug, SecretPath: secretPath, Slug: slug, ProjectSlug: projectSlug, Data: res.Data, TemplateIDs: []int{templateId}})
		return res.Data, nil
	}
}

func ProcessTemplate(templateId int, templatePath string, data interface{}, accessToken string, existingEtag string, currentEtag *string, dynamicSecretManager *DynamicSecretLeaseManager) (*bytes.Buffer, error) {
	// custom template function to fetch secrets from Infisical
	secretFunction := secretTemplateFunction(accessToken, existingEtag, currentEtag)
	dynamicSecretFunction := dynamicSecretTemplateFunction(accessToken, dynamicSecretManager, templateId)
	getSingleSecretFunction := getSingleSecretTemplateFunction(accessToken, existingEtag, currentEtag)
	funcs := template.FuncMap{
		"secret":          secretFunction, // depreciated
		"listSecrets":     secretFunction,
		"dynamic_secret":  dynamicSecretFunction,
		"getSecretByName": getSingleSecretFunction,
		"minus": func(a, b int) int {
			return a - b
		},
		"add": func(a, b int) int {
			return a + b
		},
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

func ProcessBase64Template(templateId int, encodedTemplate string, data interface{}, accessToken string, existingEtag string, currentEtag *string, dynamicSecretLeaser *DynamicSecretLeaseManager) (*bytes.Buffer, error) {
	// custom template function to fetch secrets from Infisical
	decoded, err := base64.StdEncoding.DecodeString(encodedTemplate)
	if err != nil {
		return nil, err
	}

	templateString := string(decoded)

	secretFunction := secretTemplateFunction(accessToken, existingEtag, currentEtag) // TODO: Fix this
	dynamicSecretFunction := dynamicSecretTemplateFunction(accessToken, dynamicSecretLeaser, templateId)
	funcs := template.FuncMap{
		"secret":         secretFunction,
		"dynamic_secret": dynamicSecretFunction,
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

type AgentManager struct {
	accessToken              string
	accessTokenTTL           time.Duration
	accessTokenMaxTTL        time.Duration
	accessTokenFetchedTime   time.Time
	accessTokenRefreshedTime time.Time
	mutex                    sync.Mutex
	filePaths                []Sink // Store file paths if needed
	templates                []Template
	dynamicSecretLeases      *DynamicSecretLeaseManager

	authConfigBytes []byte
	authStrategy    util.AuthStrategyType

	newAccessTokenNotificationChan        chan bool
	removeUniversalAuthClientSecretOnRead bool
	cachedUniversalAuthClientSecret       string
	exitAfterAuth                         bool

	infisicalClient infisicalSdk.InfisicalClientInterface
}

type NewAgentMangerOptions struct {
	FileDeposits []Sink
	Templates    []Template

	AuthConfigBytes []byte
	AuthStrategy    util.AuthStrategyType

	NewAccessTokenNotificationChan chan bool
	ExitAfterAuth                  bool
}

func NewAgentManager(options NewAgentMangerOptions) *AgentManager {

	return &AgentManager{
		filePaths: options.FileDeposits,
		templates: options.Templates,

		authConfigBytes: options.AuthConfigBytes,
		authStrategy:    options.AuthStrategy,

		newAccessTokenNotificationChan: options.NewAccessTokenNotificationChan,
		exitAfterAuth:                  options.ExitAfterAuth,

		infisicalClient: infisicalSdk.NewInfisicalClient(infisicalSdk.Config{
			SiteUrl:   config.INFISICAL_URL,
			UserAgent: api.USER_AGENT, // ? Should we perhaps use a different user agent for the Agent for better analytics?
		}),
	}

}

func (tm *AgentManager) SetToken(token string, accessTokenTTL time.Duration, accessTokenMaxTTL time.Duration) {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	tm.accessToken = token
	tm.accessTokenTTL = accessTokenTTL
	tm.accessTokenMaxTTL = accessTokenMaxTTL

	tm.newAccessTokenNotificationChan <- true
}

func (tm *AgentManager) GetToken() string {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	return tm.accessToken
}

func (tm *AgentManager) FetchUniversalAuthAccessToken() (credential infisicalSdk.MachineIdentityCredential, e error) {

	var universalAuthConfig UniversalAuth
	if err := ParseAuthConfig(tm.authConfigBytes, &universalAuthConfig); err != nil {
		return infisicalSdk.MachineIdentityCredential{}, fmt.Errorf("unable to parse auth config due to error: %v", err)
	}

	clientID, err := util.GetEnvVarOrFileContent(util.INFISICAL_UNIVERSAL_AUTH_CLIENT_ID_NAME, universalAuthConfig.ClientIDPath)
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, fmt.Errorf("unable to get client id: %v", err)
	}

	clientSecret, err := util.GetEnvVarOrFileContent("INFISICAL_UNIVERSAL_CLIENT_SECRET", universalAuthConfig.ClientSecretPath)
	if err != nil {
		if len(tm.cachedUniversalAuthClientSecret) == 0 {
			return infisicalSdk.MachineIdentityCredential{}, fmt.Errorf("unable to get client secret: %v", err)
		}
		clientSecret = tm.cachedUniversalAuthClientSecret
	}

	tm.cachedUniversalAuthClientSecret = clientSecret
	if tm.removeUniversalAuthClientSecretOnRead {
		defer os.Remove(universalAuthConfig.ClientSecretPath)
	}

	return tm.infisicalClient.Auth().UniversalAuthLogin(clientID, clientSecret)

}

func (tm *AgentManager) FetchKubernetesAuthAccessToken() (credential infisicalSdk.MachineIdentityCredential, err error) {

	var kubernetesAuthConfig KubernetesAuth
	if err := ParseAuthConfig(tm.authConfigBytes, &kubernetesAuthConfig); err != nil {
		return infisicalSdk.MachineIdentityCredential{}, fmt.Errorf("unable to parse auth config due to error: %v", err)
	}

	identityId, err := util.GetEnvVarOrFileContent(util.INFISICAL_MACHINE_IDENTITY_ID_NAME, kubernetesAuthConfig.IdentityID)
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, fmt.Errorf("unable to get identity id: %v", err)
	}

	serviceAccountTokenPath := os.Getenv(util.INFISICAL_KUBERNETES_SERVICE_ACCOUNT_TOKEN_NAME)
	if serviceAccountTokenPath == "" {
		serviceAccountTokenPath = kubernetesAuthConfig.ServiceAccountToken
		if serviceAccountTokenPath == "" {
			serviceAccountTokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token"
		}
	}

	return tm.infisicalClient.Auth().KubernetesAuthLogin(identityId, serviceAccountTokenPath)

}

func (tm *AgentManager) FetchAzureAuthAccessToken() (credential infisicalSdk.MachineIdentityCredential, err error) {

	var azureAuthConfig AzureAuth
	if err := ParseAuthConfig(tm.authConfigBytes, &azureAuthConfig); err != nil {
		return infisicalSdk.MachineIdentityCredential{}, fmt.Errorf("unable to parse auth config due to error: %v", err)
	}

	identityId, err := util.GetEnvVarOrFileContent(util.INFISICAL_MACHINE_IDENTITY_ID_NAME, azureAuthConfig.IdentityID)
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, fmt.Errorf("unable to get identity id: %v", err)
	}

	return tm.infisicalClient.Auth().AzureAuthLogin(identityId, "")

}

func (tm *AgentManager) FetchGcpIdTokenAuthAccessToken() (credential infisicalSdk.MachineIdentityCredential, err error) {

	var gcpIdTokenAuthConfig GcpIdTokenAuth
	if err := ParseAuthConfig(tm.authConfigBytes, &gcpIdTokenAuthConfig); err != nil {
		return infisicalSdk.MachineIdentityCredential{}, fmt.Errorf("unable to parse auth config due to error: %v", err)
	}

	identityId, err := util.GetEnvVarOrFileContent(util.INFISICAL_MACHINE_IDENTITY_ID_NAME, gcpIdTokenAuthConfig.IdentityID)
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, fmt.Errorf("unable to get identity id: %v", err)
	}

	return tm.infisicalClient.Auth().GcpIdTokenAuthLogin(identityId)

}

func (tm *AgentManager) FetchGcpIamAuthAccessToken() (credential infisicalSdk.MachineIdentityCredential, err error) {

	var gcpIamAuthConfig GcpIamAuth
	if err := ParseAuthConfig(tm.authConfigBytes, &gcpIamAuthConfig); err != nil {
		return infisicalSdk.MachineIdentityCredential{}, fmt.Errorf("unable to parse auth config due to error: %v", err)
	}

	identityId, err := util.GetEnvVarOrFileContent(util.INFISICAL_MACHINE_IDENTITY_ID_NAME, gcpIamAuthConfig.IdentityID)
	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, fmt.Errorf("unable to get identity id: %v", err)
	}

	serviceAccountKeyPath := os.Getenv(util.INFISICAL_GCP_IAM_SERVICE_ACCOUNT_KEY_FILE_PATH_NAME)
	if serviceAccountKeyPath == "" {
		// we don't need to read this file, because the service account key path is directly read inside the sdk
		serviceAccountKeyPath = gcpIamAuthConfig.ServiceAccountKey
		if serviceAccountKeyPath == "" {
			return infisicalSdk.MachineIdentityCredential{}, fmt.Errorf("gcp service account key path not found")
		}
	}

	return tm.infisicalClient.Auth().GcpIamAuthLogin(identityId, serviceAccountKeyPath)

}

func (tm *AgentManager) FetchAwsIamAuthAccessToken() (credential infisicalSdk.MachineIdentityCredential, err error) {

	var awsIamAuthConfig AwsIamAuth
	if err := ParseAuthConfig(tm.authConfigBytes, &awsIamAuthConfig); err != nil {
		return infisicalSdk.MachineIdentityCredential{}, fmt.Errorf("unable to parse auth config due to error: %v", err)
	}

	identityId, err := util.GetEnvVarOrFileContent(util.INFISICAL_MACHINE_IDENTITY_ID_NAME, awsIamAuthConfig.IdentityID)

	if err != nil {
		return infisicalSdk.MachineIdentityCredential{}, fmt.Errorf("unable to get identity id: %v", err)
	}

	return tm.infisicalClient.Auth().AwsIamAuthLogin(identityId)

}

// Fetches a new access token using client credentials
func (tm *AgentManager) FetchNewAccessToken() error {

	authStrategies := map[util.AuthStrategyType]func() (credential infisicalSdk.MachineIdentityCredential, e error){
		util.AuthStrategy.UNIVERSAL_AUTH:    tm.FetchUniversalAuthAccessToken,
		util.AuthStrategy.KUBERNETES_AUTH:   tm.FetchKubernetesAuthAccessToken,
		util.AuthStrategy.AZURE_AUTH:        tm.FetchAzureAuthAccessToken,
		util.AuthStrategy.GCP_ID_TOKEN_AUTH: tm.FetchGcpIdTokenAuthAccessToken,
		util.AuthStrategy.GCP_IAM_AUTH:      tm.FetchGcpIamAuthAccessToken,
		util.AuthStrategy.AWS_IAM_AUTH:      tm.FetchAwsIamAuthAccessToken,
	}

	if _, ok := authStrategies[tm.authStrategy]; !ok {
		return fmt.Errorf("auth strategy %s not found", tm.authStrategy)
	}

	credential, err := authStrategies[tm.authStrategy]()

	if err != nil {
		return err
	}

	accessTokenTTL := time.Duration(credential.ExpiresIn * int64(time.Second))
	accessTokenMaxTTL := time.Duration(credential.AccessTokenMaxTTL * int64(time.Second))

	if accessTokenTTL <= time.Duration(5)*time.Second {
		util.PrintErrorMessageAndExit("At this time, agent does not support refresh of tokens with 5 seconds or less ttl. Please increase access token ttl and try again")
	}

	tm.accessTokenFetchedTime = time.Now()
	tm.SetToken(credential.AccessToken, accessTokenTTL, accessTokenMaxTTL)

	return nil
}

// Refreshes the existing access token
func (tm *AgentManager) RefreshAccessToken() error {
	httpClient := resty.New()
	httpClient.SetRetryCount(10000).
		SetRetryMaxWaitTime(20 * time.Second).
		SetRetryWaitTime(5 * time.Second)

	accessToken := tm.GetToken()
	response, err := api.CallMachineIdentityRefreshAccessToken(httpClient, api.UniversalAuthRefreshRequest{AccessToken: accessToken})
	if err != nil {
		return err
	}

	accessTokenTTL := time.Duration(response.AccessTokenTTL * int(time.Second))
	accessTokenMaxTTL := time.Duration(response.AccessTokenMaxTTL * int(time.Second))
	tm.accessTokenRefreshedTime = time.Now()

	tm.SetToken(response.AccessToken, accessTokenTTL, accessTokenMaxTTL)

	return nil
}

func (tm *AgentManager) ManageTokenLifecycle() {
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
			// case: token has reached max ttl and we should re-authenticate entirely (cannot refresh)
			log.Info().Msgf("token has reached max ttl, attempting to re authenticate...")
			err := tm.FetchNewAccessToken()
			if err != nil {
				log.Error().Msgf("unable to authenticate because %v. Will retry in 30 seconds", err)

				// wait a bit before trying again
				time.Sleep((30 * time.Second))
				continue
			}
		} else {
			// case: token ttl has expired, but the token is still within max ttl, so we can refresh
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

func (tm *AgentManager) WriteTokenToFiles() {
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

func (tm *AgentManager) WriteTemplateToFile(bytes *bytes.Buffer, template *Template) {
	if err := WriteBytesToFile(bytes, template.DestinationPath); err != nil {
		log.Error().Msgf("template engine: unable to write secrets to path because %s. Will try again on next cycle", err)
		return
	}
	log.Info().Msgf("template engine: secret template at path %s has been rendered and saved to path %s", template.SourcePath, template.DestinationPath)
}

func (tm *AgentManager) MonitorSecretChanges(secretTemplate Template, templateId int, sigChan chan os.Signal) {

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
		select {
		case <-sigChan:
			return
		default:
			{
				tm.dynamicSecretLeases.Prune()
				token := tm.GetToken()
				if token != "" {
					var processedTemplate *bytes.Buffer
					var err error

					if secretTemplate.SourcePath != "" {
						processedTemplate, err = ProcessTemplate(templateId, secretTemplate.SourcePath, nil, token, existingEtag, &currentEtag, tm.dynamicSecretLeases)
					} else {
						processedTemplate, err = ProcessBase64Template(templateId, secretTemplate.Base64TemplateContent, nil, token, existingEtag, &currentEtag, tm.dynamicSecretLeases)
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

					// now the idea is we pick the next sleep time in which the one shorter out of
					// - polling time
					// - first lease that's gonna get expired in the template
					firstLeaseExpiry, isValid := tm.dynamicSecretLeases.GetFirstExpiringLeaseTime(templateId)
					var waitTime = pollingInterval
					if isValid && firstLeaseExpiry.Sub(time.Now()) < pollingInterval {
						waitTime = firstLeaseExpiry.Sub(time.Now())
					}
					time.Sleep(waitTime)
				} else {
					// It fails to get the access token. So we will re-try in 3 seconds. We do this because if we don't, the user will have to wait for the next polling interval to get the first secret render.
					time.Sleep(3 * time.Second)
				}
			}
		}
	}
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
			log.Error().Msgf("No agent config file provided at %v. Please provide a agent config file", configPath)
			return
		}

		agentConfig, err := ParseAgentConfig(agentConfigInBytes)
		if err != nil {
			log.Error().Msgf("Unable to prase %s because %v. Please ensure that is follows the Infisical Agent config structure", configPath, err)
			return
		}

		authMethodValid, authStrategy := util.IsAuthMethodValid(agentConfig.Auth.Type, false)

		if !authMethodValid {
			util.PrintErrorMessageAndExit(fmt.Sprintf("The auth method '%s' is not supported.", agentConfig.Auth.Type))
		}

		tokenRefreshNotifier := make(chan bool)
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

		filePaths := agentConfig.Sinks

		configBytes, err := yaml.Marshal(agentConfig.Auth.Config)
		if err != nil {
			log.Error().Msgf("unable to marshal auth config because %v", err)
			return
		}

		tm := NewAgentManager(NewAgentMangerOptions{
			FileDeposits:                   filePaths,
			Templates:                      agentConfig.Templates,
			AuthConfigBytes:                configBytes,
			NewAccessTokenNotificationChan: tokenRefreshNotifier,
			ExitAfterAuth:                  agentConfig.Infisical.ExitAfterAuth,
			AuthStrategy:                   authStrategy,
		})

		tm.dynamicSecretLeases = NewDynamicSecretLeaseManager(sigChan)

		go tm.ManageTokenLifecycle()

		for i, template := range agentConfig.Templates {
			log.Info().Msgf("template engine started for template %v...", i+1)
			go tm.MonitorSecretChanges(template, i, sigChan)
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
