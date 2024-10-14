/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v2"
)

const (
	FormatDotenv       string = "dotenv"
	FormatJson         string = "json"
	FormatCSV          string = "csv"
	FormatYaml         string = "yaml"
	FormatDotEnvExport string = "dotenv-export"
)

// exportCmd represents the export command
var exportCmd = &cobra.Command{
	Use:                   "export",
	Short:                 "Used to export environment variables to a file",
	DisableFlagsInUseLine: true,
	Example:               "infisical export --env=prod --format=json > secrets.json",
	Args:                  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		environmentName, _ := cmd.Flags().GetString("env")
		if !cmd.Flags().Changed("env") {
			environmentFromWorkspace := util.GetEnvFromWorkspaceFile()
			if environmentFromWorkspace != "" {
				environmentName = environmentFromWorkspace
			}
		}

		shouldExpandSecrets, err := cmd.Flags().GetBool("expand")
		if err != nil {
			util.HandleError(err)
		}

		includeImports, err := cmd.Flags().GetBool("include-imports")
		if err != nil {
			util.HandleError(err)
		}

		projectId, err := cmd.Flags().GetString("projectId")
		if err != nil {
			util.HandleError(err)
		}

		token, err := util.GetInfisicalToken(cmd)
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		format, err := cmd.Flags().GetString("format")
		if err != nil {
			util.HandleError(err)
		}

		templatePath, err := cmd.Flags().GetString("template")
		if err != nil {
			util.HandleError(err)
		}

		secretOverriding, err := cmd.Flags().GetBool("secret-overriding")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		tagSlugs, err := cmd.Flags().GetString("tags")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		secretsPath, err := cmd.Flags().GetString("path")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		request := models.GetAllSecretsParameters{
			Environment:            environmentName,
			TagSlugs:               tagSlugs,
			WorkspaceId:            projectId,
			SecretsPath:            secretsPath,
			IncludeImport:          includeImports,
			ExpandSecretReferences: shouldExpandSecrets,
		}

		if token != nil && token.Type == util.SERVICE_TOKEN_IDENTIFIER {
			request.InfisicalToken = token.Token
		} else if token != nil && token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER {
			request.UniversalAuthAccessToken = token.Token
		}

		if templatePath != "" {
			sigChan := make(chan os.Signal, 1)
			dynamicSecretLeases := NewDynamicSecretLeaseManager(sigChan)
			newEtag := ""

			accessToken := ""
			if token != nil {
				accessToken = token.Token
			} else {
				log.Debug().Msg("GetAllEnvironmentVariables: Trying to fetch secrets using logged in details")
				loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails()
				if err != nil {
					util.HandleError(err)
				}
				accessToken = loggedInUserDetails.UserCredentials.JTWToken
			}

			processedTemplate, err := ProcessTemplate(1, templatePath, nil, accessToken, "", &newEtag, dynamicSecretLeases)
			if err != nil {
				util.HandleError(err)
			}
			fmt.Print(processedTemplate.String())
			return
		}

		secrets, err := util.GetAllEnvironmentVariables(request, "")
		if err != nil {
			util.HandleError(err, "Unable to fetch secrets")
		}

		if secretOverriding {
			secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_PERSONAL)
		} else {
			secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_SHARED)
		}

		var output string
		secrets = util.FilterSecretsByTag(secrets, tagSlugs)
		secrets = util.SortSecretsByKeys(secrets)

		output, err = formatEnvs(secrets, format)
		if err != nil {
			util.HandleError(err)
		}

		fmt.Print(output)

		// Telemetry.CaptureEvent("cli-command:export", posthog.NewProperties().Set("secretsCount", len(secrets)).Set("version", util.CLI_VERSION))
	},
}

func init() {
	rootCmd.AddCommand(exportCmd)
	exportCmd.Flags().StringP("env", "e", "dev", "Set the environment (dev, prod, etc.) from which your secrets should be pulled from")
	exportCmd.Flags().Bool("expand", true, "Parse shell parameter expansions in your secrets")
	exportCmd.Flags().StringP("format", "f", "dotenv", "Set the format of the output file (dotenv, json, csv)")
	exportCmd.Flags().Bool("secret-overriding", true, "Prioritizes personal secrets, if any, with the same name over shared secrets")
	exportCmd.Flags().Bool("include-imports", true, "Imported linked secrets")
	exportCmd.Flags().String("token", "", "Fetch secrets using service token or machine identity access token")
	exportCmd.Flags().StringP("tags", "t", "", "filter secrets by tag slugs")
	exportCmd.Flags().String("projectId", "", "manually set the projectId to export secrets from")
	exportCmd.Flags().String("path", "/", "get secrets within a folder path")
	exportCmd.Flags().String("template", "", "The path to the template file used to render secrets")
}

// Format according to the format flag
func formatEnvs(envs []models.SingleEnvironmentVariable, format string) (string, error) {
	switch strings.ToLower(format) {
	case FormatDotenv:
		return formatAsDotEnv(envs), nil
	case FormatDotEnvExport:
		return formatAsDotEnvExport(envs), nil
	case FormatJson:
		return formatAsJson(envs), nil
	case FormatCSV:
		return formatAsCSV(envs), nil
	case FormatYaml:
		return formatAsYaml(envs)
	default:
		return "", fmt.Errorf("invalid format type: %s. Available format types are [%s]", format, []string{FormatDotenv, FormatJson, FormatCSV, FormatYaml, FormatDotEnvExport})
	}
}

// Format environment variables as a CSV file
func formatAsCSV(envs []models.SingleEnvironmentVariable) string {
	csvString := &strings.Builder{}
	writer := csv.NewWriter(csvString)
	writer.Write([]string{"Key", "Value"})
	for _, env := range envs {
		writer.Write([]string{env.Key, env.Value})
	}
	writer.Flush()
	return csvString.String()
}

// Format environment variables as a dotenv file
func formatAsDotEnv(envs []models.SingleEnvironmentVariable) string {
	var dotenv string
	for _, env := range envs {
		dotenv += fmt.Sprintf("%s='%s'\n", env.Key, env.Value)
	}
	return dotenv
}

// Format environment variables as a dotenv file with export at the beginning
func formatAsDotEnvExport(envs []models.SingleEnvironmentVariable) string {
	var dotenv string
	for _, env := range envs {
		dotenv += fmt.Sprintf("export %s='%s'\n", env.Key, env.Value)
	}
	return dotenv
}

func formatAsYaml(envs []models.SingleEnvironmentVariable) (string, error) {
	m := make(map[string]string)
	for _, env := range envs {
		m[env.Key] = env.Value
	}

	yamlBytes, err := yaml.Marshal(m)
	if err != nil {
		return "", fmt.Errorf("failed to format environment variables as YAML: %w", err)
	}

	return string(yamlBytes), nil
}

// Format environment variables as a JSON file
func formatAsJson(envs []models.SingleEnvironmentVariable) string {
	// Dump as a json array
	json, err := json.Marshal(envs)
	if err != nil {
		log.Err(err).Msgf("Unable to marshal environment variables to JSON")
		return ""
	}
	return string(json)
}
