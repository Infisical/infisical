package util

import (
	"fmt"

	"github.com/Infisical/infisical/k8-operator/internal/api"
	"github.com/Infisical/infisical/k8-operator/internal/model"
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

func GetProjectBySlug(accessToken string, projectSlug string) (model.Project, error) {
	httpClient := resty.New()
	httpClient.
		SetAuthScheme("Bearer").
		SetAuthToken(accessToken).
		SetHeader("Accept", "application/json")

	project, err := api.CallGetProjectByIDv2(httpClient, api.GetProjectByIDRequest{
		ProjectID: projectSlug,
	})

	if err != nil {
		return model.Project{}, fmt.Errorf("unable to get project by slug. [err=%v]", err)
	}

	return project, nil
}

func GetProjectIDBySlug(accessToken string, projectSlug string) (string, error) {

	httpClient := resty.New()
	httpClient.
		SetAuthScheme("Bearer").
		SetAuthToken(accessToken).
		SetHeader("Accept", "application/json")

	projectResponse, err := api.CallGetProjectBySlug(httpClient, api.GetProjectBySlugRequest{
		ProjectSlug: projectSlug,
	})
	if err != nil {
		return "", fmt.Errorf("unable to get project by slug. [err=%v]", err)
	}

	return projectResponse.ID, nil
}
