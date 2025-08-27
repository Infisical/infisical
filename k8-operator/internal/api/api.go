package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/Infisical/infisical/k8-operator/internal/model"
	"github.com/go-resty/resty/v2"
)

const USER_AGENT_NAME = "k8-operator"

func CallGetServiceTokenDetailsV2(httpClient *resty.Client) (GetServiceTokenDetailsResponse, error) {
	var tokenDetailsResponse GetServiceTokenDetailsResponse
	response, err := httpClient.
		R().
		SetResult(&tokenDetailsResponse).
		SetHeader("User-Agent", USER_AGENT_NAME).
		Get(fmt.Sprintf("%v/v2/service-token", API_HOST_URL))

	if err != nil {
		return GetServiceTokenDetailsResponse{}, fmt.Errorf("CallGetServiceTokenDetails: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return GetServiceTokenDetailsResponse{}, fmt.Errorf("CallGetServiceTokenDetails: Unsuccessful response: [response=%s]", response)
	}

	return tokenDetailsResponse, nil
}

func CallGetServiceTokenAccountDetailsV2(httpClient *resty.Client) (ServiceAccountDetailsResponse, error) {
	var serviceAccountDetailsResponse ServiceAccountDetailsResponse
	response, err := httpClient.
		R().
		SetResult(&serviceAccountDetailsResponse).
		SetHeader("User-Agent", USER_AGENT_NAME).
		Get(fmt.Sprintf("%v/v2/service-accounts/me", API_HOST_URL))

	if err != nil {
		return ServiceAccountDetailsResponse{}, fmt.Errorf("CallGetServiceTokenAccountDetailsV2: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return ServiceAccountDetailsResponse{}, fmt.Errorf("CallGetServiceTokenAccountDetailsV2: Unsuccessful response: [response=%s]", response)
	}

	return serviceAccountDetailsResponse, nil
}

func CallUniversalMachineIdentityLogin(request MachineIdentityUniversalAuthLoginRequest) (MachineIdentityDetailsResponse, error) {
	var machineIdentityDetailsResponse MachineIdentityDetailsResponse

	response, err := resty.New().
		R().
		SetResult(&machineIdentityDetailsResponse).
		SetBody(request).
		SetHeader("User-Agent", USER_AGENT_NAME).
		Post(fmt.Sprintf("%v/v1/auth/universal-auth/login", API_HOST_URL))

	if err != nil {
		return MachineIdentityDetailsResponse{}, fmt.Errorf("CallUniversalMachineIdentityLogin: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return MachineIdentityDetailsResponse{}, fmt.Errorf("CallUniversalMachineIdentityLogin: Unsuccessful response: [response=%s]", response)
	}

	return machineIdentityDetailsResponse, nil
}

func CallUniversalMachineIdentityRefreshAccessToken(request MachineIdentityUniversalAuthRefreshRequest) (MachineIdentityDetailsResponse, error) {
	var universalAuthRefreshResponse MachineIdentityDetailsResponse

	response, err := resty.New().
		R().
		SetResult(&universalAuthRefreshResponse).
		SetHeader("User-Agent", USER_AGENT_NAME).
		SetBody(request).
		Post(fmt.Sprintf("%v/v1/auth/token/renew", API_HOST_URL))

	if err != nil {
		return MachineIdentityDetailsResponse{}, fmt.Errorf("CallUniversalAuthRefreshAccessToken: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return MachineIdentityDetailsResponse{}, fmt.Errorf("CallUniversalAuthRefreshAccessToken: Unsuccessful response [%v %v] [status-code=%v] [response=%v]", response.Request.Method, response.Request.URL, response.StatusCode(), response.String())
	}

	return universalAuthRefreshResponse, nil
}

func CallGetServiceAccountWorkspacePermissionsV2(httpClient *resty.Client) (ServiceAccountWorkspacePermissions, error) {
	var serviceAccountWorkspacePermissionsResponse ServiceAccountWorkspacePermissions
	response, err := httpClient.
		R().
		SetResult(&serviceAccountWorkspacePermissionsResponse).
		SetHeader("User-Agent", USER_AGENT_NAME).
		Get(fmt.Sprintf("%v/v2/service-accounts/<service-account-id>/permissions/workspace", API_HOST_URL))

	if err != nil {
		return ServiceAccountWorkspacePermissions{}, fmt.Errorf("CallGetServiceAccountWorkspacePermissionsV2: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return ServiceAccountWorkspacePermissions{}, fmt.Errorf("CallGetServiceAccountWorkspacePermissionsV2: Unsuccessful response: [response=%s]", response)
	}

	return serviceAccountWorkspacePermissionsResponse, nil
}

func CallGetServiceAccountKeysV2(httpClient *resty.Client, request GetServiceAccountKeysRequest) (GetServiceAccountKeysResponse, error) {
	var serviceAccountKeysResponse GetServiceAccountKeysResponse
	response, err := httpClient.
		R().
		SetResult(&serviceAccountKeysResponse).
		SetHeader("User-Agent", USER_AGENT_NAME).
		Get(fmt.Sprintf("%v/v2/service-accounts/%v/keys", API_HOST_URL, request.ServiceAccountId))

	if err != nil {
		return GetServiceAccountKeysResponse{}, fmt.Errorf("CallGetServiceAccountKeysV2: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return GetServiceAccountKeysResponse{}, fmt.Errorf("CallGetServiceAccountKeysV2: Unsuccessful response: [response=%s]", response)
	}

	return serviceAccountKeysResponse, nil
}

func CallGetProjectByID(httpClient *resty.Client, request GetProjectByIDRequest) (GetProjectByIDResponse, error) {

	var projectResponse GetProjectByIDResponse

	response, err := httpClient.
		R().SetResult(&projectResponse).
		SetHeader("User-Agent", USER_AGENT_NAME).
		Get(fmt.Sprintf("%s/v1/workspace/%s", API_HOST_URL, request.ProjectID))

	if err != nil {
		return GetProjectByIDResponse{}, fmt.Errorf("CallGetProject: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return GetProjectByIDResponse{}, fmt.Errorf("CallGetProject: Unsuccessful response: [response=%s]", response)
	}

	return projectResponse, nil

}

func CallGetProjectByIDv2(httpClient *resty.Client, request GetProjectByIDRequest) (model.Project, error) {
	var projectResponse model.Project

	response, err := httpClient.
		R().SetResult(&projectResponse).
		SetHeader("User-Agent", USER_AGENT_NAME).
		Get(fmt.Sprintf("%s/v2/workspace/%s", API_HOST_URL, request.ProjectID))

	if err != nil {
		return model.Project{}, fmt.Errorf("CallGetProject: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return model.Project{}, fmt.Errorf("CallGetProject: Unsuccessful response: [response=%s]", response)
	}

	return projectResponse, nil

}

func CallGetProjectBySlug(httpClient *resty.Client, request GetProjectBySlugRequest) (GetProjectBySlugResponse, error) {

	var projectResponse GetProjectBySlugResponse

	response, err := httpClient.
		R().SetResult(&projectResponse).
		SetHeader("User-Agent", USER_AGENT_NAME).
		Get(fmt.Sprintf("%s/v2/projects/%s", API_HOST_URL, request.ProjectSlug))

	if err != nil {
		return GetProjectBySlugResponse{}, fmt.Errorf("CallGetProjectBySlug: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return GetProjectBySlugResponse{}, fmt.Errorf("CallGetProjectBySlug: Unsuccessful response: [response=%s]", response)
	}

	return projectResponse, nil

}

func CallSubscribeProjectEvents(httpClient *resty.Client, projectId, secretsPath, envSlug, token string) (*http.Response, error) {
	conditions := &SubscribeProjectEventsRequestCondition{
		SecretPath:      secretsPath,
		EnvironmentSlug: envSlug,
	}

	body, err := json.Marshal(&SubscribeProjectEventsRequest{
		ProjectID: projectId,
		Register: []SubscribeProjectEventsRequestRegister{
			{
				Event:      "secret:create",
				Conditions: conditions,
			},
			{
				Event:      "secret:update",
				Conditions: conditions,
			},
			{
				Event:      "secret:delete",
				Conditions: conditions,
			},
			{
				Event:      "secret:import-mutation",
				Conditions: conditions,
			},
		},
	})

	if err != nil {
		return nil, fmt.Errorf("CallSubscribeProjectEvents: Unable to marshal body [err=%s]", err)
	}

	response, err := httpClient.
		R().
		SetDoNotParseResponse(true).
		SetHeader("User-Agent", USER_AGENT_NAME).
		SetHeader("Content-Type", "application/json").
		SetHeader("Accept", "text/event-stream").
		SetHeader("Connection", "keep-alive").
		SetHeader("Authorization", fmt.Sprint("Bearer ", token)).
		SetBody(body).
		Post(fmt.Sprintf("%s/v1/events/subscribe/project-events", API_HOST_URL))

	if err != nil {
		return nil, fmt.Errorf("CallSubscribeProjectEvents: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		data := struct {
			Message string `json:"message"`
		}{}

		if err := json.NewDecoder(response.RawBody()).Decode(&data); err != nil {
			return nil, err
		}

		return nil, fmt.Errorf("CallSubscribeProjectEvents: Unsuccessful response: [message=%s]", data.Message)
	}

	return response.RawResponse, nil
}
