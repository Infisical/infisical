package cmd

import (
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
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		util.RequireLocalWorkspaceFile()
		util.RequireLogin()
	},
	Run: func(cmd *cobra.Command, args []string) {

		environmentName, _ := cmd.Flags().GetString("env")
		if !cmd.Flags().Changed("env") {
			environmentFromWorkspace := util.GetEnvFromWorkspaceFile()
			if environmentFromWorkspace != "" {
				environmentName = environmentFromWorkspace
			}
		}

		infisicalToken, err := cmd.Flags().GetString("token")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		foldersPath, err := cmd.Flags().GetString("path")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		folders, err := util.GetAllFolders(models.GetAllFoldersParameters{Environment: environmentName, InfisicalToken: infisicalToken, FoldersPath: foldersPath})
		if err != nil {
			util.HandleError(err, "Unable to get folders")
		}

		visualize.PrintAllFoldersDetails(folders)
		Telemetry.CaptureEvent("cli-command:folders get", posthog.NewProperties().Set("folderCount", len(folders)).Set("version", util.CLI_VERSION))
	},
}

var createCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a folder",
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		util.RequireLogin()
		util.RequireLocalWorkspaceFile()
	},
	Run: func(cmd *cobra.Command, args []string) {
		environmentName, _ := cmd.Flags().GetString("env")
		if !cmd.Flags().Changed("env") {
			environmentFromWorkspace := util.GetEnvFromWorkspaceFile()
			if environmentFromWorkspace != "" {
				environmentName = environmentFromWorkspace
			}
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
			util.HandleError(fmt.Errorf("Invalid folder name"), "Folder name cannot be empty")
		}

		workspaceFile, err := util.GetWorkSpaceFromFile()
		if err != nil {
			util.HandleError(err, "Unable to get workspace file")
		}

		params := models.CreateFolderParameters{
			FolderName:  folderName,
			WorkspaceId: workspaceFile.WorkspaceId,
			Environment: environmentName,
			FolderPath:  folderPath,
		}

		folder, err := util.CreateFolder(params)
		if err != nil {
			util.HandleError(err, "Unable to create folder")
		}

		folders := []models.SingleFolder{folder}
		visualize.PrintAllFoldersDetails(folders)
		Telemetry.CaptureEvent("cli-command:folders create", posthog.NewProperties().Set("version", util.CLI_VERSION))
	},
}

var deleteCmd = &cobra.Command{
	Use:   "delete",
	Short: "Delete a folder",
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		util.RequireLogin()
		util.RequireLocalWorkspaceFile()
	},
	Run: func(cmd *cobra.Command, args []string) {

		environmentName, _ := cmd.Flags().GetString("env")
		if !cmd.Flags().Changed("env") {
			environmentFromWorkspace := util.GetEnvFromWorkspaceFile()
			if environmentFromWorkspace != "" {
				environmentName = environmentFromWorkspace
			}
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
			util.HandleError(fmt.Errorf("Invalid folder name"), "Folder name cannot be empty")
		}

		workspaceFile, err := util.GetWorkSpaceFromFile()
		if err != nil {
			util.HandleError(err, "Unable to get workspace file")
		}

		params := models.DeleteFolderParameters{
			FolderName:  folderName,
			WorkspaceId: workspaceFile.WorkspaceId,
			Environment: environmentName,
			FolderPath:  folderPath,
		}

		folders, err := util.DeleteFolder(params)
		if err != nil {
			util.HandleError(err, "Unable to delete folder")
		}

		visualize.PrintAllFoldersDetails(folders)
		Telemetry.CaptureEvent("cli-command:folders delete", posthog.NewProperties().Set("version", util.CLI_VERSION))
	},
}

func init() {

	folderCmd.PersistentFlags().String("env", "dev", "Used to select the environment name on which actions should be taken on")

	// Add getCmd, createCmd and deleteCmd flags here
	getCmd.Flags().StringP("path", "p", "/", "Path to the directory whose folders will be fetched")
	getCmd.Flags().StringP("token", "t", "", "Fetch folders using the infisical token")
	folderCmd.AddCommand(getCmd)

	// Add createCmd flags here
	createCmd.Flags().StringP("path", "p", "/", "Path to the directory where the folder will be created")
	createCmd.Flags().StringP("name", "n", "", "Name of the folder to be created")
	folderCmd.AddCommand(createCmd)

	// Add deleteCmd flags here
	deleteCmd.Flags().StringP("path", "p", "/", "Path to the directory where the folder will be deleted")
	deleteCmd.Flags().StringP("name", "n", "", "Name of the folder to be deleted")
	folderCmd.AddCommand(deleteCmd)

	rootCmd.AddCommand(folderCmd)

}
