package cmd

import (
	"errors"

	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/manifoldco/promptui"
	"github.com/spf13/cobra"
)

var switchCmd = &cobra.Command{
	Use:                   "switch",
	Short:                 "Used to switch between Infisical profiles",
	DisableFlagsInUseLine: true,
	Example:               "infisical switch",
	Args:                  cobra.ExactArgs(0),
	PreRun: func(cmd *cobra.Command, args []string) {
		util.RequireLogin()
	},
	Run: func(cmd *cobra.Command, args []string) {
		//get previous logged in profiles
		loggedInProfiles, err := getLoggedInUsers()
		if err != nil {
			util.HandleError(err, "[infisical switch]: Unable to get logged Profiles")
		}

		//prompt user
		profile, err := LoggedInUsersPrompt(loggedInProfiles)
		if err != nil {
			util.HandleError(err, "[infisical switch]: Prompt error")
		}

		//write to config file
		configFile, err := util.GetConfigFile()
		if err != nil {
			util.HandleError(err, "[infisical switch]: Unable to get config file")
		}

		configFile.LoggedInUserEmail = profile
		ok := util.Contains(configFile.LoggedInUsersEmail, profile)
		if !ok {
			configFile.LoggedInUsersEmail = append(configFile.LoggedInUsersEmail, profile)
		}

		err = util.WriteConfigFile(&configFile)
		if err != nil {
			util.HandleError(err, "")
		}
	},
}

func init() {
	rootCmd.AddCommand(switchCmd)
}

func getLoggedInUsers() ([]string, error) {
	loggedInProfiles := []string{}

	if util.ConfigFileExists() {
		configFile, err := util.GetConfigFile()
		if err != nil {
			return loggedInProfiles, err
		}

		//get logged in profiles
		//
		if configFile.LoggedInUsersEmail == nil {
			loggedInProfiles = append(loggedInProfiles, configFile.LoggedInUserEmail)
		} else {
			if len(configFile.LoggedInUsersEmail) > 0 {
				loggedInProfiles = append(loggedInProfiles, configFile.LoggedInUsersEmail...)
			}
		}
		return loggedInProfiles, nil
	} else {
		//empty
		return loggedInProfiles, errors.New("couldn't retrieve config file")
	}
}

func LoggedInUsersPrompt(profiles []string) (string, error) {
	prompt := promptui.Select{Label: "Which of your Infisical profiles would you like to use",
		Items: profiles,
		Size:  7,
	}

	idx, _, err := prompt.Run()
	if err != nil {
		return "", err
	}

	return profiles[idx], nil
}
