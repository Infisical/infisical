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

		userCreds, err := util.GetCurrentLoggedInUserDetails(true)
		if err != nil {
			util.HandleError(err, "Unable to get your login details")
		}

		if userCreds.LoginExpired {
			userCreds = util.EstablishUserLoginSession()
		}

		httpClient, err := util.GetRestyClientWithCustomHeaders()
		if err != nil {
			util.HandleError(err, "Unable to get resty client with custom headers")
		}
		httpClient.SetAuthToken(userCreds.UserCredentials.JTWToken)

		organizationResponse, err := api.CallGetAllOrganizations(httpClient)
		if err != nil {
			util.HandleError(err, "Unable to pull organizations that belong to you")
		}

		organizations := organizationResponse.Organizations

		organizationNames := util.GetOrganizationsNameList(organizationResponse)

		prompt := promptui.Select{
			Label: "Which Infisical organization would you like to select a project from?",
			Items: organizationNames,
			Size:  7,
		}

		index, _, err := prompt.Run()
		if err != nil {
			util.HandleError(err)
		}

		selectedOrganization := organizations[index]

		tokenResponse, err := api.CallSelectOrganization(httpClient, api.SelectOrganizationRequest{OrganizationId: selectedOrganization.ID})
		if tokenResponse.MfaEnabled {
			i := 1
			for i < 6 {
				mfaVerifyCode := askForMFACode(tokenResponse.MfaMethod)

				httpClient, err := util.GetRestyClientWithCustomHeaders()
				if err != nil {
					util.HandleError(err, "Unable to get resty client with custom headers")
				}
				httpClient.SetAuthToken(tokenResponse.Token)
				verifyMFAresponse, mfaErrorResponse, requestError := api.CallVerifyMfaToken(httpClient, api.VerifyMfaTokenRequest{
					Email:     userCreds.UserCredentials.Email,
					MFAToken:  mfaVerifyCode,
					MFAMethod: tokenResponse.MfaMethod,
				})
				if requestError != nil {
					util.HandleError(err)
					break
				} else if mfaErrorResponse != nil {
					if mfaErrorResponse.Context.Code == "mfa_invalid" {
						msg := fmt.Sprintf("Incorrect, verification code. You have %v attempts left", 5-i)
						fmt.Println(msg)
						if i == 5 {
							util.PrintErrorMessageAndExit("No tries left, please try again in a bit")
							break
						}
					}

					if mfaErrorResponse.Context.Code == "mfa_expired" {
						util.PrintErrorMessageAndExit("Your 2FA verification code has expired, please try logging in again")
						break
					}
					i++
				} else {
					httpClient.SetAuthToken(verifyMFAresponse.Token)
					tokenResponse, err = api.CallSelectOrganization(httpClient, api.SelectOrganizationRequest{OrganizationId: selectedOrganization.ID})
					break
				}
			}
		}

		if err != nil {
			util.HandleError(err, "Unable to select organization")
		}

		// set the config jwt token to the new token
		userCreds.UserCredentials.JTWToken = tokenResponse.Token
		err = util.StoreUserCredsInKeyRing(&userCreds.UserCredentials)
		httpClient.SetAuthToken(tokenResponse.Token)

		if err != nil {
			util.HandleError(err, "Unable to store your user credentials")
		}

		workspaceResponse, err := api.CallGetAllWorkSpacesUserBelongsTo(httpClient)
		if err != nil {
			util.HandleError(err, "Unable to pull projects that belong to you")
		}

		filteredWorkspaces, workspaceNames := util.GetWorkspacesInOrganization(workspaceResponse, selectedOrganization.ID)

		prompt = promptui.Select{
			Label: "Which of your Infisical projects would you like to connect this project to?",
			Items: workspaceNames,
			Size:  7,
		}

		index, _, err = prompt.Run()
		if err != nil {
			util.HandleError(err)
		}

		err = writeWorkspaceFile(filteredWorkspaces[index])
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
