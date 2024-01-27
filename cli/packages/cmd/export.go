/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
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

		projectId, err := cmd.Flags().GetString("projectId")
		if err != nil {
			util.HandleError(err)
		}

		format, err := cmd.Flags().GetString("format")
		if err != nil {
			util.HandleError(err)
		}

		secretOverriding, err := cmd.Flags().GetBool("secret-overriding")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		infisicalToken, err := cmd.Flags().GetString("token")
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

		groupByTags, err := cmd.Flags().GetBool("group-by-tags")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		secrets, err := util.GetAllEnvironmentVariables(models.GetAllSecretsParameters{Environment: environmentName, InfisicalToken: infisicalToken, TagSlugs: tagSlugs, WorkspaceId: projectId, SecretsPath: secretsPath}, "")
		if err != nil {
			util.HandleError(err, "Unable to fetch secrets")
		}

		if secretOverriding {
			secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_PERSONAL)
		} else {
			secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_SHARED)
		}

		var output string
		if shouldExpandSecrets {
			substitutions := util.ExpandSecrets(secrets, infisicalToken, "")
			output, err = formatEnvs(substitutions, format, groupByTags)
			if err != nil {
				util.HandleError(err)
			}
		} else {
			output, err = formatEnvs(secrets, format, groupByTags)
			if err != nil {
				util.HandleError(err)
			}
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
	exportCmd.Flags().Bool("group-by-tags", false, "Exported secrets are grouped by tags support dotenv format only. Default to false")
	exportCmd.Flags().String("token", "", "Fetch secrets using the Infisical Token")
	exportCmd.Flags().StringP("tags", "t", "", "filter secrets by tag slugs")
	exportCmd.Flags().String("projectId", "", "manually set the projectId to fetch secrets from")
	exportCmd.Flags().String("path", "/", "get secrets within a folder path")
}

// Format according to the format flag
func formatEnvs(envs []models.SingleEnvironmentVariable, format string, groupByTags bool) (string, error) {
	switch strings.ToLower(format) {
	case FormatDotenv:
		return formatAsDotEnv(envs, groupByTags), nil
	case FormatDotEnvExport:
		return formatAsDotEnvExport(envs), nil
	case FormatJson:
		return formatAsJson(envs), nil
	case FormatCSV:
		return formatAsCSV(envs), nil
	case FormatYaml:
		return formatAsYaml(envs), nil
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
func formatAsDotEnv(envs []models.SingleEnvironmentVariable, groupByTags bool) string {
	var dotenv string
 
	if !groupByTags {
		for _, env := range envs {
			dotenv += fmt.Sprintf("%s='%s'\n", env.Key, env.Value)
		}
		return dotenv
	}

	tags := make(map[string][]models.SingleEnvironmentVariable)
	var noTags = []models.SingleEnvironmentVariable{}


	// populate the tags map and noTags slice
	for _, env := range envs {
		if len(env.Tags) == 0 {
			noTags = append(noTags, env)
			continue
		}

		var tagsString string

		for _, tag := range env.Tags {
			tagsString += tag.Name + ", "
		}
		tagsString = strings.TrimSuffix(tagsString, ", ")
		
		if _, ok := tags[tagsString];!ok {
			tags[tagsString] = []models.SingleEnvironmentVariable{}
		}

		tags[tagsString] = append(tags[tagsString], env)
		
	}

	for tag, envs := range tags {
		dotenv += fmt.Sprintf("# %s\n", tag)
		dotenv += formatAsDotEnv(envs, false)
		dotenv += "\n"
	}

	dotenv += formatAsDotEnv(noTags, false)

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

func formatAsYaml(envs []models.SingleEnvironmentVariable) string {
	var dotenv string
	for _, env := range envs {
		dotenv += fmt.Sprintf("%s: %s\n", env.Key, env.Value)
	}
	return dotenv
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
