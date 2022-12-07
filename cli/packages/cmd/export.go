/*
Copyright © 2022 NAME HERE <EMAIL ADDRESS>
*/
package cmd

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

const (
	FormatDotenv string = "dotenv"
	FormatJson   string = "json"
	FormatCSV    string = "csv"
)

// exportCmd represents the export command
var exportCmd = &cobra.Command{
	Use:                   "export",
	Short:                 "Used to export environment variables to a file",
	DisableFlagsInUseLine: true,
	Example:               "infisical export --env=prod --format=json > secrets.json",
	Args:                  cobra.NoArgs,
	PreRun:                toggleDebug,
	Run: func(cmd *cobra.Command, args []string) {
		envName, err := cmd.Flags().GetString("env")
		if err != nil {
			log.Errorln("Unable to parse the environment flag")
			log.Debugln(err)
			return
		}

		shouldExpandSecrets, err := cmd.Flags().GetBool("expand")
		if err != nil {
			log.Errorln("Unable to parse the substitute flag")
			log.Debugln(err)
			return
		}

		projectId, err := cmd.Flags().GetString("projectId")
		if err != nil {
			log.Errorln("Unable to parse the project id flag")
			log.Debugln(err)
			return
		}

		format, err := cmd.Flags().GetString("format")
		if err != nil {
			log.Errorln("Unable to parse the format flag")
			log.Debugln(err)
			return
		}

		envsFromApi, err := util.GetAllEnvironmentVariables(projectId, envName)
		if err != nil {
			log.Errorln("Something went wrong when pulling secrets using your Infisical token. Double check the token, project id or environment name (dev, prod, ect.)")
			log.Debugln(err)
			return
		}

		var output string
		if shouldExpandSecrets {
			substitutions := util.SubstituteSecrets(envsFromApi)
			output, err = formatEnvs(substitutions, format)
			if err != nil {
				log.Errorln(err)
				return
			}
		} else {
			output, err = formatEnvs(envsFromApi, format)
			if err != nil {
				log.Errorln(err)
				return
			}
		}
		fmt.Print(output)
	},
}

func init() {
	rootCmd.AddCommand(exportCmd)
	exportCmd.Flags().StringP("env", "e", "dev", "Set the environment (dev, prod, etc.) from which your secrets should be pulled from")
	exportCmd.Flags().String("projectId", "", "The project ID from which your secrets should be pulled from")
	exportCmd.Flags().Bool("expand", true, "Parse shell parameter expansions in your secrets")
	exportCmd.Flags().StringP("format", "f", "dotenv", "Set the format of the output file (dotenv, json, csv)")
}

// Format according to the format flag
func formatEnvs(envs []models.SingleEnvironmentVariable, format string) (string, error) {
	switch strings.ToLower(format) {
	case FormatDotenv:
		return formatAsDotEnv(envs), nil
	case FormatJson:
		return formatAsJson(envs), nil
	case FormatCSV:
		return formatAsCSV(envs), nil
	default:
		return "", fmt.Errorf("invalid format flag: %s", format)
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

// Format environment variables as a JSON file
func formatAsJson(envs []models.SingleEnvironmentVariable) string {
	// Dump as a json array
	json, err := json.Marshal(envs)
	if err != nil {
		log.Errorln("Unable to marshal environment variables to JSON")
		log.Debugln(err)
		return ""
	}
	return string(json)
}
