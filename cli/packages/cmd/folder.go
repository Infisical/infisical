package cmd

import (
	"errors"
	"fmt"

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/Infisical/infisical-merge/packages/visualize"
	"github.com/posthog/posthog-go"
	"github.com/spf13/cobra"
)

var folderCmd = &cobra.Command{
	Use:                   "folders",
	Short:                 "Create, delete, and list folders",
	DisableFlagsInUseLine: true,
	Run: func(cmd *cobra.Command, args []string) {
		cmd.Help()
	},
}

var getCmd = &cobra.Command{
	Use:   "get",
	Short: "Get folders in a directory",
	Run: func(cmd *cobra.Command, args []string) {

		environmentName, _ := cmd.Flags().GetString("env")
		if !cmd.Flags().Changed("env") {
			environmentFromWorkspace := util.GetEnvFromWorkspaceFile()
			if environmentFromWorkspace != "" {
				environmentName = environmentFromWorkspace
			}
		}

		projectId, err := cmd.Flags().GetString("projectId")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		token, err := util.GetInfisicalToken(cmd)
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}
		foldersPath, err := cmd.Flags().GetString("path")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		request := models.GetAllFoldersParameters{
			Environment: environmentName,
			WorkspaceId: projectId,
			FoldersPath: foldersPath,
		}

		if token != nil && token.Type == util.SERVICE_TOKEN_IDENTIFIER {
			request.InfisicalToken = token.Token
		} else if token != nil && token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER {
			request.UniversalAuthAccessToken = token.Token
		}

		folders, err := util.GetAllFolders(request)
		if err != nil {
			util.HandleError(err, "Unable to get folders")
		}

		visualize.PrintAllFoldersDetails(folders, foldersPath)
		Telemetry.CaptureEvent("cli-command:folders get", posthog.NewProperties().Set("folderCount", len(folders)).Set("version", util.CLI_VERSION))
	},
}

var createCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a folder",
	Run: func(cmd *cobra.Command, args []string) {
		environmentName, _ := cmd.Flags().GetString("env")
		if !cmd.Flags().Changed("env") {
			environmentFromWorkspace := util.GetEnvFromWorkspaceFile()
			if environmentFromWorkspace != "" {
				environmentName = environmentFromWorkspace
			}
		}

		token, err := util.GetInfisicalToken(cmd)
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		projectId, err := cmd.Flags().GetString("projectId")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		folderPath, err := cmd.Flags().GetString("path")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		folderName, err := cmd.Flags().GetString("name")
		if err != nil {
			util.HandleError(err, "Unable to parse name flag")
		}

		if folderName == "" {
			util.HandleError(errors.New("invalid folder name, folder name cannot be empty"))
		}

		if err != nil {
			util.HandleError(err, "Unable to get workspace file")
		}

		if projectId == "" {
			workspaceFile, err := util.GetWorkSpaceFromFile()
			if err != nil {
				util.PrintErrorMessageAndExit("Please either run infisical init to connect to a project or pass in project id with --projectId flag")
			}

			projectId = workspaceFile.WorkspaceId
		}

		params := models.CreateFolderParameters{
			FolderName:  folderName,
			Environment: environmentName,
			FolderPath:  folderPath,
			WorkspaceId: projectId,
		}

		if token != nil && (token.Type == util.SERVICE_TOKEN_IDENTIFIER || token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER) {
			params.InfisicalToken = token.Token
		}

		_, err = util.CreateFolder(params)
		if err != nil {
			util.HandleError(err, "Unable to create folder")
		}

		util.PrintSuccessMessage(fmt.Sprintf("folder named `%s` created in path %s", folderName, folderPath))

		Telemetry.CaptureEvent("cli-command:folders create", posthog.NewProperties().Set("version", util.CLI_VERSION))
	},
}

var deleteCmd = &cobra.Command{
	Use:   "delete",
	Short: "Delete a folder",
	Run: func(cmd *cobra.Command, args []string) {

		environmentName, _ := cmd.Flags().GetString("env")
		if !cmd.Flags().Changed("env") {
			environmentFromWorkspace := util.GetEnvFromWorkspaceFile()
			if environmentFromWorkspace != "" {
				environmentName = environmentFromWorkspace
			}
		}

		token, err := util.GetInfisicalToken(cmd)
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		projectId, err := cmd.Flags().GetString("projectId")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		folderPath, err := cmd.Flags().GetString("path")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		folderName, err := cmd.Flags().GetString("name")
		if err != nil {
			util.HandleError(err, "Unable to parse name flag")
		}

		if folderName == "" {
			util.HandleError(errors.New("invalid folder name, folder name cannot be empty"))
		}

		if projectId == "" {
			workspaceFile, err := util.GetWorkSpaceFromFile()
			if err != nil {
				util.PrintErrorMessageAndExit("Please either run infisical init to connect to a project or pass in project id with --projectId flag")
			}

			projectId = workspaceFile.WorkspaceId
		}

		params := models.DeleteFolderParameters{
			FolderName:  folderName,
			WorkspaceId: projectId,
			Environment: environmentName,
			FolderPath:  folderPath,
		}

		if token != nil && (token.Type == util.SERVICE_TOKEN_IDENTIFIER || token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER) {
			params.InfisicalToken = token.Token
		}

		_, err = util.DeleteFolder(params)
		if err != nil {
			util.HandleError(err, "Unable to delete folder")
		}

		util.PrintSuccessMessage(fmt.Sprintf("folder named `%s` deleted in path %s", folderName, folderPath))

		Telemetry.CaptureEvent("cli-command:folders delete", posthog.NewProperties().Set("version", util.CLI_VERSION))
	},
}
