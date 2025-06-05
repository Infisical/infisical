package cmd

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/manifoldco/promptui"
	"github.com/posthog/posthog-go"
	"github.com/spf13/cobra"
)

var userCmd = &cobra.Command{
	Use:                   "user",
	Short:                 "Used to manage local user credentials",
	DisableFlagsInUseLine: true,
	Example:               "infisical user",
	Args:                  cobra.ExactArgs(0),
	Run: func(cmd *cobra.Command, args []string) {
		cmd.Help()
	},
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

		Telemetry.CaptureEvent("cli-command:user switch", posthog.NewProperties().Set("numberOfLoggedInProfiles", len(loggedInProfiles)).Set("version", util.CLI_VERSION))
	},
}

var userGetCmd = &cobra.Command{
	Use:                   "get",
	Short:                 "Used to get properties of an Infisical profile",
	DisableFlagsInUseLine: true,
	Example:               "infisical user get",
	Args:                  cobra.ExactArgs(0),
	Run: func(cmd *cobra.Command, args []string) {
		cmd.Help()
	},
}

var userGetTokenCmd = &cobra.Command{
	Use:                   "token",
	Short:                 "Used to get the access token of an Infisical user",
	DisableFlagsInUseLine: true,
	Example:               "infisical user get token",
	Args:                  cobra.ExactArgs(0),
	PreRun: func(cmd *cobra.Command, args []string) {
		util.RequireLogin()
	},
	Run: func(cmd *cobra.Command, args []string) {
		loggedInUserDetails, err := util.GetCurrentLoggedInUserDetails(true)
		if loggedInUserDetails.LoginExpired {
			loggedInUserDetails = util.EstablishUserLoginSession()
		}

		if err != nil {
			util.HandleError(err, "[infisical user get token]: Unable to get logged in user token")
		}

		tokenParts := strings.Split(loggedInUserDetails.UserCredentials.JTWToken, ".")
		if len(tokenParts) != 3 {
			util.HandleError(errors.New("invalid token format"), "[infisical user get token]: Invalid token format")
		}

		payload, err := base64.RawURLEncoding.DecodeString(tokenParts[1])
		if err != nil {
			util.HandleError(err, "[infisical user get token]: Unable to decode token payload")
		}

		var tokenPayload struct {
			TokenVersionId string `json:"tokenVersionId"`
		}
		if err := json.Unmarshal(payload, &tokenPayload); err != nil {
			util.HandleError(err, "[infisical user get token]: Unable to parse token payload")
		}

		fmt.Println("Session ID:", tokenPayload.TokenVersionId)
		fmt.Println("Token:", loggedInUserDetails.UserCredentials.JTWToken)
	},
}

var updateCmd = &cobra.Command{
	Use:                   "update",
	Short:                 "Used to update properties of an Infisical profile",
	DisableFlagsInUseLine: true,
	Example:               "infisical user update",
	Args:                  cobra.ExactArgs(0),
	Run: func(cmd *cobra.Command, args []string) {
		cmd.Help()
	},
}

var domainCmd = &cobra.Command{
	Use:                   "domain",
	Short:                 "Used to update the domain of an Infisical profile",
	DisableFlagsInUseLine: true,
	Example:               "infisical user update domain",
	Args:                  cobra.ExactArgs(0),
	PreRun: func(cmd *cobra.Command, args []string) {
		util.RequireLogin()
	},
	Run: func(cmd *cobra.Command, args []string) {
		//prompt for profiles selection
		loggedInProfiles, err := getLoggedInUsers()
		if err != nil {
			util.HandleError(err, "[infisical user update domain]: Unable to get logged Profiles")
		}

		//prompt user
		profile, err := LoggedInUsersPrompt(loggedInProfiles)
		if err != nil {
			util.HandleError(err, "[infisical user update domain]: Prompt error")
		}

		domain := ""
		domainQuery := true
		if config.INFISICAL_URL_MANUAL_OVERRIDE != fmt.Sprintf("%s/api", util.INFISICAL_DEFAULT_EU_URL) && config.INFISICAL_URL_MANUAL_OVERRIDE != fmt.Sprintf("%s/api", util.INFISICAL_DEFAULT_US_URL) {

			override, err := DomainOverridePrompt()
			if err != nil {
				util.HandleError(err, "[infisical user update domain]: Domain override prompt error")
			}

			if !override {
				domainQuery = false
				domain = config.INFISICAL_URL_MANUAL_OVERRIDE
			}

		}

		if domainQuery {
			//prompt to update domain
			domain, err = NewDomainPrompt()
			if err != nil {
				util.HandleError(err, "[infisical user update domain]: Prompt error")
			}
		}

		//write to config file
		configFile, err := util.GetConfigFile()
		if err != nil {
			util.HandleError(err, "[infisical user update domain]: Unable to get config file")
		}

		//check if profile in logged in profiles

		//if not add new profile loggedInUsers
		//else update profile from loggedinUsers slice
		ok := util.ConfigContainsEmail(configFile.LoggedInUsers, profile)
		if !ok {
			configFile.LoggedInUsers = append(configFile.LoggedInUsers, models.LoggedInUser{
				Email:  profile,
				Domain: domain,
			})
		} else {
			//exists, set logged in user domain
			for idx, v := range configFile.LoggedInUsers {
				if profile == v.Email {
					configFile.LoggedInUsers[idx].Domain = domain //inplace
					break
				}
			}

		}
		//check if current loggedinuser is selected profile
		//if yes set current domain to changed domain
		if configFile.LoggedInUserEmail == profile {
			configFile.LoggedInUserDomain = domain
		}

		err = util.WriteConfigFile(&configFile)
		if err != nil {
			util.HandleError(err, "")
		}
		Telemetry.CaptureEvent("cli-command:user domain", posthog.NewProperties().Set("version", util.CLI_VERSION))
	},
}

func init() {
	updateCmd.AddCommand(domainCmd)
	userCmd.AddCommand(updateCmd)
	userGetCmd.AddCommand(userGetTokenCmd)
	userCmd.AddCommand(userGetCmd)
	userCmd.AddCommand(switchCmd)
	rootCmd.AddCommand(userCmd)
}

// This returns all logged in user emails from the config file.
// If none, it returns the current logged in user in a slice
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
		Default:  "Example - https://my-self-hosted-instance.com/api",
	}

	domain, err := domainPrompt.Run()
	if err != nil {
		return "", err
	}

	return util.AppendAPIEndpoint(domain), nil
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
