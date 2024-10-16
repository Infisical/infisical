package util

import (
	"fmt"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/models"
)

func GetOrganizationsNameList(organizationResponse api.GetOrganizationsResponse) []string {
	organizations := organizationResponse.Organizations

	if len(organizations) == 0 {
		message := fmt.Sprintf("You don't have any organization created in Infisical. You must first create a organization at %s", config.INFISICAL_URL)
		PrintErrorMessageAndExit(message)
	}

	var organizationNames []string
	for _, workspace := range organizations {
		organizationNames = append(organizationNames, workspace.Name)
	}

	return organizationNames
}

func GetWorkspacesInOrganization(workspaceResponse api.GetWorkSpacesResponse, orgId string) ([]models.Workspace, []string) {
	workspaces := workspaceResponse.Workspaces

	var filteredWorkspaces []models.Workspace
	var workspaceNames []string

	for _, workspace := range workspaces {
		if workspace.OrganizationId == orgId {
			filteredWorkspaces = append(filteredWorkspaces, workspace)
			workspaceNames = append(workspaceNames, workspace.Name)
		}
	}

	if len(filteredWorkspaces) == 0 {
		message := fmt.Sprintf("You don't have any projects created in Infisical organization. You must first create a project at %s", config.INFISICAL_URL)
		PrintErrorMessageAndExit(message)
	}

	return filteredWorkspaces, workspaceNames
}
