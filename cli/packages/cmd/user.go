package cmd

import (
	"errors"
	"net/url"

	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/manifoldco/promptui"
	"github.com/spf13/cobra"
)

var userCmd = &cobra.Command{
	Use:                   "user",
	Short:                 "Used manage user credentials",
	DisableFlagsInUseLine: true,
	Example:               "infisical user",
	Args:                  cobra.ExactArgs(0),
	Run:                   func(cmd *cobra.Command, args []string) {},
}

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
			util.HandleError(err, "[infisical user switch]: Unable to get logged Profiles")
		}

		//prompt user
		profile, err := LoggedInUsersPrompt(loggedInProfiles)
		if err != nil {
			util.HandleError(err, "[infisical user switch]: Prompt error")
		}

		//write to config file
		configFile, err := util.GetConfigFile()
		if err != nil {
			util.HandleError(err, "[infisical user switch]: Unable to get config file")
		}

		configFile.LoggedInUserEmail = profile

		//set logged in user domain
		ok := util.ConfigContainsEmail(configFile.LoggedInUsers, profile)

		if !ok {
			//profile not in loggedInUsers
			configFile.LoggedInUsers = append(configFile.LoggedInUsers, models.LoggedInUser{
				Email:  profile,
				Domain: config.INFISICAL_URL,
			})
			//set logged in user domain
			configFile.LoggedInUserDomain = config.INFISICAL_URL

		} else {
			//exists, set logged in user domain
			for _, v := range configFile.LoggedInUsers {
				if profile == v.Email {
					configFile.LoggedInUserDomain = v.Domain
					break
				}
			}
		}

		err = util.WriteConfigFile(&configFile)
		if err != nil {
			util.HandleError(err, "")
		}
	},
}

var domainCmd = &cobra.Command{
	Use:                   "domain",
	Short:                 "Used to update the domain of an Infisical profile",
	DisableFlagsInUseLine: true,
	Example:               "infisical user domain",
	Args:                  cobra.ExactArgs(0),
	PreRun: func(cmd *cobra.Command, args []string) {
		util.RequireLogin()
	},
	Run: func(cmd *cobra.Command, args []string) {
		//prompt for profiles selection
		loggedInProfiles, err := getLoggedInUsers()
		if err != nil {
			util.HandleError(err, "[infisical user domain]: Unable to get logged Profiles")
		}

		//prompt user
		profile, err := LoggedInUsersPrompt(loggedInProfiles)
		if err != nil {
			util.HandleError(err, "[infisical user domain]: Prompt error")
		}

		//prompt to update domain
		domain, err := NewDomainPrompt()
		if err != nil {
			util.HandleError(err, "[infisical user domain]: Prompt error")
		}

		//write to config file
		configFile, err := util.GetConfigFile()
		if err != nil {
			util.HandleError(err, "[infisical user]: Unable to get config file")
		}

		//check if profile in logged in profiles

		//if not add new profile loggedInUsers
		//else update profile from loggedinUsers list
		ok := util.ConfigContainsEmail(configFile.LoggedInUsers, profile)
		if !ok {
			configFile.LoggedInUsers = append(configFile.LoggedInUsers, models.LoggedInUser{
				Email:  profile,
				Domain: domain,
			})
		} else {
			//exists, set logged in user domain
			for _, v := range configFile.LoggedInUsers {
				if profile == v.Email {
					v.Domain = domain
					break
				}
			}

		}
		//check if current loggedinuser is selected profile
		//if yes set current domain to changed domain
		if configFile.LoggedInUserEmail == profile {
			configFile.LoggedInUserDomain = domain
		}

	},
}

func init() {
	userCmd.AddCommand(domainCmd)
	userCmd.AddCommand(switchCmd)
	rootCmd.AddCommand(userCmd)
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
		if len(configFile.LoggedInUsers) > 0 {
			for _, v := range configFile.LoggedInUsers {
				loggedInProfiles = append(loggedInProfiles, v.Email)
			}
		} else {

			loggedInProfiles = append(loggedInProfiles, configFile.LoggedInUserEmail)
		}
		return loggedInProfiles, nil
	} else {
		//empty
		return loggedInProfiles, errors.New("couldn't retrieve config file")
	}
}

func NewDomainPrompt() (string, error) {
	urlValidation := func(input string) error {
		_, err := url.ParseRequestURI(input)
		if err != nil {
			return errors.New("this is an invalid url")
		}
		return nil
	}

	//else run prompt to enter domain
	domainPrompt := promptui.Prompt{
		Label:    "New Domain",
		Validate: urlValidation,
	}

	domain, err := domainPrompt.Run()
	if err != nil {
		return "", err
	}

	return domain, nil
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
