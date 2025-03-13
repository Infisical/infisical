package util

import (
	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/go-resty/resty/v2"
)

func GetProjectDetails(accessToken string, projectId string) (api.Project, error) {
	httpClient := resty.New()
	httpClient.SetAuthToken(accessToken).
		SetHeader("Accept", "application/json")

	res, err := api.CallGetProjectById(httpClient, projectId)
	if err != nil {
		return api.Project{}, err
	}

	return res, nil
}
