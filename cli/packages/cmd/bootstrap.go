/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"text/template"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
)

// handleK8SecretOutput processes the k8-secret output type by creating a Kubernetes secret
func handleK8SecretOutput(bootstrapResponse api.BootstrapInstanceResponse, k8SecretTemplate, k8SecretName, k8SecretNamespace string) error {
	// Read Kubernetes service account credentials from the pod
	k8sToken, err := os.ReadFile(util.KUBERNETES_SERVICE_ACCOUNT_TOKEN_PATH)
	if err != nil {
		return fmt.Errorf("failed to read Kubernetes service account token: %v", err)
	}

	k8sCaCert, err := os.ReadFile(util.KUBERNETES_SERVICE_ACCOUNT_CA_CERT_PATH)
	if err != nil {
		return fmt.Errorf("failed to read Kubernetes CA certificate: %v", err)
	}

	// Get Kubernetes API server URL from environment variables
	k8sHost := os.Getenv(util.KUBERNETES_SERVICE_HOST_ENV_NAME)
	k8sPort := os.Getenv(util.KUBERNETES_SERVICE_PORT_HTTPS_ENV_NAME)
	if k8sHost == "" || k8sPort == "" {
		return fmt.Errorf("failed to get Kubernetes API server address from environment variables")
	}

	k8sApiUrl := fmt.Sprintf("https://%s:%s", k8sHost, k8sPort)

	// Parse and execute the template to render only the data/stringData section
	tmpl, err := template.New("k8-secret-template").Funcs(template.FuncMap{
		"b64enc": func(s string) string {
			return base64.StdEncoding.EncodeToString([]byte(s))
		},
	}).Parse(k8SecretTemplate)

	if err != nil {
		return fmt.Errorf("failed to parse output template: %v", err)
	}

	var renderedDataSection bytes.Buffer
	err = tmpl.Execute(&renderedDataSection, bootstrapResponse)
	if err != nil {
		return fmt.Errorf("failed to execute output template: %v", err)
	}

	// Parse the rendered template as JSON to validate it's valid
	var dataSection map[string]interface{}
	if err := json.Unmarshal(renderedDataSection.Bytes(), &dataSection); err != nil {
		return fmt.Errorf("template output is not valid JSON: %v", err)
	}

	// Construct the complete Kubernetes secret object
	k8sSecret := map[string]interface{}{
		"apiVersion": "v1",
		"kind":       "Secret",
		"metadata": map[string]interface{}{
			"name":      k8SecretName,
			"namespace": k8SecretNamespace,
		},
		"type": "Opaque",
	}

	// Merge the rendered data section into the secret
	for key, value := range dataSection {
		k8sSecret[key] = value
	}

	// Prepare the HTTP client with TLS configuration
	caCertPool := x509.NewCertPool()
	if !caCertPool.AppendCertsFromPEM(k8sCaCert) {
		return fmt.Errorf("failed to parse Kubernetes CA certificate")
	}

	tlsConfig := &tls.Config{
		RootCAs: caCertPool,
	}

	// Create a new HTTP client for Kubernetes API
	k8sHttpClient, err := util.GetRestyClientWithCustomHeaders()
	if err != nil {
		return fmt.Errorf("failed to create Kubernetes HTTP client: %v", err)
	}

	k8sHttpClient.SetTLSClientConfig(tlsConfig)
	k8sHttpClient.SetHeader("Authorization", fmt.Sprintf("Bearer %s", string(k8sToken)))
	k8sHttpClient.SetHeader("Content-Type", "application/json")

	// Check if secret already exists first
	checkUrl := fmt.Sprintf("%s/api/v1/namespaces/%s/secrets/%s", k8sApiUrl, k8SecretNamespace, k8SecretName)
	checkResponse, err := k8sHttpClient.R().Get(checkUrl)

	if err != nil {
		return fmt.Errorf("failed to check if Kubernetes secret exists: %v", err)
	}

	secretUrl := fmt.Sprintf("%s/api/v1/namespaces/%s/secrets", k8sApiUrl, k8SecretNamespace)

	if checkResponse.StatusCode() == 200 {
		// Secret exists, update it
		secretUrl = fmt.Sprintf("%s/%s", secretUrl, k8SecretName)
		response, err := k8sHttpClient.R().
			SetBody(k8sSecret).
			Put(secretUrl)

		if err != nil {
			return fmt.Errorf("failed to update Kubernetes secret: %v", err)
		}

		if response.IsError() {
			return fmt.Errorf("kubernetes API returned error when updating secret: %s", response.String())
		}

		log.Info().Msgf("Successfully updated Kubernetes secret '%s' in namespace '%s'", k8SecretName, k8SecretNamespace)
	} else {
		// Secret doesn't exist, create it
		response, err := k8sHttpClient.R().
			SetBody(k8sSecret).
			Post(secretUrl)

		if err != nil {
			return fmt.Errorf("failed to create Kubernetes secret: %v", err)
		}

		if response.IsError() {
			return fmt.Errorf("kubernetes API returned error when creating secret: %s", response.String())
		}

		log.Info().Msgf("Successfully created Kubernetes secret '%s' in namespace '%s'", k8SecretName, k8SecretNamespace)
	}

	return nil
}

var bootstrapCmd = &cobra.Command{
	Use:                   "bootstrap",
	Short:                 "Used to bootstrap your Infisical instance",
	DisableFlagsInUseLine: true,
	Example:               "infisical bootstrap",
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		email, _ := cmd.Flags().GetString("email")
		if email == "" {
			if envEmail, ok := os.LookupEnv(util.INFISICAL_BOOTSTRAP_EMAIL_NAME); ok {
				email = envEmail
			}
		}

		if email == "" {
			log.Error().Msg("email is required")
			return
		}

		password, _ := cmd.Flags().GetString("password")
		if password == "" {
			if envPassword, ok := os.LookupEnv(util.INFISICAL_BOOTSTRAP_PASSWORD_NAME); ok {
				password = envPassword
			}
		}

		if password == "" {
			log.Error().Msg("password is required")
			return
		}

		organization, _ := cmd.Flags().GetString("organization")
		if organization == "" {
			if envOrganization, ok := os.LookupEnv(util.INFISICAL_BOOTSTRAP_ORGANIZATION_NAME); ok {
				organization = envOrganization
			}
		}

		if organization == "" {
			log.Error().Msg("organization is required")
			return
		}

		domain, _ := cmd.Flags().GetString("domain")
		if domain == "" {
			if envDomain, ok := os.LookupEnv("INFISICAL_API_URL"); ok {
				domain = envDomain
			}
		}

		if domain == "" {
			log.Error().Msg("domain is required")
			return
		}

		outputType, err := cmd.Flags().GetString("output")
		if err != nil {
			log.Error().Msgf("Failed to get output type: %v", err)
			return
		}

		k8SecretTemplate, err := cmd.Flags().GetString("k8-secret-template")
		if err != nil {
			log.Error().Msgf("Failed to get k8-secret-template: %v", err)
		}

		k8SecretName, err := cmd.Flags().GetString("k8-secret-name")
		if err != nil {
			log.Error().Msgf("Failed to get k8-secret-name: %v", err)
		}

		k8SecretNamespace, err := cmd.Flags().GetString("k8-secret-namespace")
		if err != nil {
			log.Error().Msgf("Failed to get k8-secret-namespace: %v", err)
		}

		if outputType == "k8-secret" {
			if k8SecretTemplate == "" {
				log.Error().Msg("k8-secret-template is required when using k8-secret output type")
				return
			}

			if k8SecretName == "" {
				log.Error().Msg("k8-secret-name is required when using k8-secret output type")
				return
			}

			if k8SecretNamespace == "" {
				log.Error().Msg("k8-secret-namespace is required when using k8-secret output type")
				return
			}
		}

		httpClient, err := util.GetRestyClientWithCustomHeaders()
		if err != nil {
			log.Error().Msgf("Failed to get resty client with custom headers: %v", err)
			return
		}

		ignoreIfBootstrapped, err := cmd.Flags().GetBool("ignore-if-bootstrapped")
		if err != nil {
			log.Error().Msgf("Failed to get ignore-if-bootstrapped flag: %v", err)
			return
		}

		httpClient.SetHeader("Accept", "application/json")

		bootstrapResponse, err := api.CallBootstrapInstance(httpClient, api.BootstrapInstanceRequest{
			Domain:       util.AppendAPIEndpoint(domain),
			Email:        email,
			Password:     password,
			Organization: organization,
		})

		if err != nil {
			if !ignoreIfBootstrapped {
				log.Error().Msgf("Failed to bootstrap instance: %v", err)
			}
			return
		}

		if outputType == "k8-secret" {
			if err := handleK8SecretOutput(bootstrapResponse, k8SecretTemplate, k8SecretName, k8SecretNamespace); err != nil {
				log.Error().Msgf("Failed to handle k8-secret output: %v", err)
				return
			}
		} else {
			responseJSON, err := json.MarshalIndent(bootstrapResponse, "", "  ")
			if err != nil {
				log.Fatal().Msgf("Failed to convert response to JSON: %v", err)
				return
			}

			fmt.Println(string(responseJSON))
		}
	},
}

func init() {
	bootstrapCmd.Flags().String("domain", "", "The domain of your self-hosted Infisical instance")
	bootstrapCmd.Flags().String("email", "", "The desired email address of the instance admin")
	bootstrapCmd.Flags().String("password", "", "The desired password of the instance admin")
	bootstrapCmd.Flags().String("organization", "", "The name of the organization to create for the instance")
	bootstrapCmd.Flags().String("output", "", "The type of output to use for the bootstrap command (json or k8-secret)")
	bootstrapCmd.Flags().Bool("ignore-if-bootstrapped", false, "Whether to continue on error if the instance has already been bootstrapped")
	bootstrapCmd.Flags().String("k8-secret-template", "", "The template to use for rendering the Kubernetes secret (entire secret JSON)")
	bootstrapCmd.Flags().String("k8-secret-namespace", "", "The namespace to use for the Kubernetes secret")
	bootstrapCmd.Flags().String("k8-secret-name", "", "The name of the Kubernetes secret to create")
	rootCmd.AddCommand(bootstrapCmd)
}
