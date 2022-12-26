/*
Copyright © 2022 NAME HERE <EMAIL ADDRESS>
*/
package cmd

import (
	"encoding/json"
	"os"

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/manifoldco/promptui"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

// runCmd represents the run command
var initCmd = &cobra.Command{
	Use:                   "init",
	Short:                 "Used to initialize your project with Infisical",
	DisableFlagsInUseLine: true,
	Example:               "infisical init",
	Args:                  cobra.ExactArgs(0),
	PreRun:                toggleDebug,
	Run: func(cmd *cobra.Command, args []string) {
		// check if user is logged
		hasUserLoggedInbefore, loggedInUserEmail, err := util.IsUserLoggedIn()
		if err != nil {
			log.Info("Unexpected issue occurred while checking login status. To see more details, add flag --debug")
			log.Debugln(err)
			return
		}

		if !hasUserLoggedInbefore {
			log.Infoln("No logged in user. To login, please run command [infisical login]")
			return
		}

		if util.WorkspaceConfigFileExistsInCurrentPath() {
			shouldOverride, err := shouldOverrideWorkspacePrompt()
			if err != nil {
				log.Errorln("Unable to parse your answer")
				log.Debug(err)
				return
			}

			if !shouldOverride {
				return
			}
		}

		userCreds, err := util.GetUserCredsFromKeyRing(loggedInUserEmail)
		if err != nil {
			log.Infoln("Unable to get user creds from key ring")
			log.Debug(err)
			return
		}

		workspaces, err := util.GetWorkSpacesFromAPI(userCreds)
		if err != nil {
			log.Errorln("Unable to pull your projects. To see more logs add the --debug flag to this command")
			log.Debugln("Unable to get your projects because:", err)
			return
		}

		if len(workspaces) == 0 {
			log.Infoln("You don't have any projects created in Infisical. You must first create a project at https://infisical.com")
			return
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
			log.Errorln("Unable to parse your response")
			log.Debug(err)
			return
		}

		err = writeWorkspaceFile(workspaces[index])
		if err != nil {
			log.Errorln("Something went wrong when creating your workspace file")
			log.Debug("Error while writing your workspace file:", err)
			return
		}
	},
}

func init() {
	rootCmd.AddCommand(initCmd)
}

func writeWorkspaceFile(selectedWorkspace models.Workspace) error {
	workspaceFileToSave := models.WorkspaceConfigFile{
		WorkspaceId: selectedWorkspace.ID,
	}

	marshalledWorkspaceFile, err := json.Marshal(workspaceFileToSave)
	if err != nil {
		return err
	}

	err = util.WriteToFile(util.INFISICAL_WORKSPACE_CONFIG_FILE_NAME, marshalledWorkspaceFile, os.ModePerm)
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
