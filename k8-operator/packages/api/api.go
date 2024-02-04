package api

import (
	"fmt"

	"github.com/go-resty/resty/v2"
)

const USER_AGENT_NAME = "k8-operator"

func CallGetEncryptedWorkspaceKey(httpClient *resty.Client, request GetEncryptedWorkspaceKeyRequest) (GetEncryptedWorkspaceKeyResponse, error) {
	endpoint := fmt.Sprintf("%v/v2/workspace/%v/encrypted-key", API_HOST_URL, request.WorkspaceId)
	var result GetEncryptedWorkspaceKeyResponse
	response, err := httpClient.
		R().
		SetResult(&result).
		SetHeader("User-Agent", USER_AGENT_NAME).
		Get(endpoint)

	if err != nil {
		return GetEncryptedWorkspaceKeyResponse{}, fmt.Errorf("CallGetEncryptedWorkspaceKey: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return GetEncryptedWorkspaceKeyResponse{}, fmt.Errorf("CallGetEncryptedWorkspaceKey: Unsuccessful response: [response=%s]", response)
	}

	return result, nil
}

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

	// logging for better debugging and user experience
	fmt.Printf("Workspace ID: %v\n", tokenDetailsResponse.Workspace)
	fmt.Printf("TokenName: %v\n", tokenDetailsResponse.Name)

	return tokenDetailsResponse, nil
}

func CallGetSecretsV3(httpClient *resty.Client, request GetEncryptedSecretsV3Request) (GetEncryptedSecretsV3Response, error) {
	var secretsResponse GetEncryptedSecretsV3Response

	httpRequest := httpClient.
		R().
		SetResult(&secretsResponse).
		SetHeader("User-Agent", USER_AGENT_NAME).
		SetHeader("If-None-Match", request.ETag).
		SetQueryParam("environment", request.Environment).
		SetQueryParam("include_imports", "true"). // TODO needs to be set as a option
		SetQueryParam("workspaceId", request.WorkspaceId)

	if request.SecretPath != "" {
		httpRequest.SetQueryParam("secretPath", request.SecretPath)
	}

	response, err := httpRequest.Get(fmt.Sprintf("%v/v3/secrets", API_HOST_URL))

	if err != nil {
		return GetEncryptedSecretsV3Response{}, fmt.Errorf("CallGetSecretsV3: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return GetEncryptedSecretsV3Response{}, fmt.Errorf("CallGetSecretsV3: Unsuccessful response. Please make sure your secret path, workspace and environment name are all correct [response=%s]", response)
	}

	if response.StatusCode() == 304 {
		secretsResponse.Modified = false
	} else {
		secretsResponse.Modified = true
	}

	secretsResponse.ETag = response.Header().Get("etag")

	return secretsResponse, nil
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
