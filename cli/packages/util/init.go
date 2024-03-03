package util

import (
	"fmt"

	"github.com/Infisical/infisical-merge/packages/api"
)

func GetWorkspacesNameList(workspaceResponse api.GetWorkSpacesResponse) ([]string, error) {
	workspaces := workspaceResponse.Workspaces

	if len(workspaces) == 0 {
		message := fmt.Sprintf("You don't have any projects created in Infisical. You must first create a project at %s", INFISICAL_TOKEN_NAME)
		PrintErrorMessageAndExit(message)
	}

	var workspaceNames []string
	for _, workspace := range workspaces {
		if workspace.DisplayName != nil {
			workspaceNames = append(workspaceNames, *workspace.DisplayName)
		} else {
			workspaceNames = append(workspaceNames, workspace.Name)
		}
	}

	return workspaceNames, nil
}
