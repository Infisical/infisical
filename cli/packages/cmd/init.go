/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/go-resty/resty/v2"
	"github.com/manifoldco/promptui"
	"github.com/posthog/posthog-go"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
)

// runCmd represents the run command
var initCmd = &cobra.Command{
	Use:                   "init",
	Short:                 "Used to connect your local project with Infisical project",
	DisableFlagsInUseLine: true,
	Example:               "infisical init",
	Args:                  cobra.ExactArgs(0),
	PreRun: func(cmd *cobra.Command, args []string) {
		util.RequireLogin()
	},
	Run: func(cmd *cobra.Command, args []string) {
		if util.WorkspaceConfigFileExistsInCurrentPath() {
			shouldOverride, err := shouldOverrideWorkspacePrompt()
			if err != nil {
				log.Error().Msg("Unable to parse your answer")
				log.Debug().Err(err)
				return
			}

			if !shouldOverride {
				return
			}
		}

		userCreds, err := util.GetCurrentLoggedInUserDetails()
		if err != nil {
			util.HandleError(err, "Unable to get your login details")
		}

		if userCreds.LoginExpired {
			util.PrintErrorMessageAndExit("Your login session has expired, please run [infisical login] and try again")
		}

		httpClient := resty.New()
		httpClient.SetAuthToken(userCreds.UserCredentials.JTWToken)
		workspaceResponse, err := api.CallGetAllWorkSpacesUserBelongsTo(httpClient)
		if err != nil {
			util.HandleError(err, "Unable to pull projects that belong to you")
		}

		workspaces := workspaceResponse.Workspaces
		if len(workspaces) == 0 {
			message := fmt.Sprintf("You don't have any projects created in Infisical. You must first create a project at %s", util.INFISICAL_TOKEN_NAME)
			util.PrintErrorMessageAndExit(message)
		}

		var workspaceNames []string
		for _, workspace := range workspaces {
			workspaceNames = append(workspaceNames, workspace.Name)
		}

		prompt := promptui.Select{
			Label: "Which of your Infisical projects would you like to connect this project to?",
			Items: workspaceNames,
			Size:  7,
		}

		index, _, err := prompt.Run()
		if err != nil {
			util.HandleError(err)
		}

		err = writeWorkspaceFile(workspaces[index])
		if err != nil {
			util.HandleError(err)
		}

		Telemetry.CaptureEvent("cli-command:init", posthog.NewProperties().Set("version", util.CLI_VERSION))

	},
}

func init() {
	rootCmd.AddCommand(initCmd)
}

func writeWorkspaceFile(selectedWorkspace models.Workspace) error {
	workspaceFileToSave := models.WorkspaceConfigFile{
		WorkspaceId: selectedWorkspace.ID,
	}

	marshalledWorkspaceFile, err := json.MarshalIndent(workspaceFileToSave, "", "    ")
	if err != nil {
		return err
	}

	err = util.WriteToFile(util.INFISICAL_WORKSPACE_CONFIG_FILE_NAME, marshalledWorkspaceFile, 0600)
	if err != nil {
		return err
	}

	return nil
}

func shouldOverrideWorkspacePrompt() (bool, error) {
	prompt := promptui.Select{
		Label: "A workspace config file already exists here. Would you like to override? Select[Yes/No]",
		Items: []string{"No", "Yes"},
	}
	_, result, err := prompt.Run()
	if err != nil {
		return false, err
	}
	return result == "Yes", nil
}
