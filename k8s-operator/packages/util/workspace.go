package util

import (
	"fmt"

	"github.com/Infisical/infisical/k8-operator/packages/api"
	"github.com/Infisical/infisical/k8-operator/packages/model"
	"github.com/go-resty/resty/v2"
)

func GetProjectByID(accessToken string, projectId string) (model.Project, error) {

	httpClient := resty.New()
	httpClient.
		SetAuthScheme("Bearer").
		SetAuthToken(accessToken).
		SetHeader("Accept", "application/json")

	projectDetails, err := api.CallGetProjectByID(httpClient, api.GetProjectByIDRequest{
		ProjectID: projectId,
	})
	if err != nil {
		return model.Project{}, fmt.Errorf("unable to get project by slug. [err=%v]", err)
	}

	return projectDetails.Project, nil
}
