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

	responseETag := response.Header().Get("etag")

	secretsResponse.Modified = request.ETag != responseETag
	secretsResponse.ETag = responseETag

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

func CallGetDecryptedSecretsV3(httpClient *resty.Client, request GetDecryptedSecretsV3Request) (GetDecryptedSecretsV3Response, error) {
	var decryptedSecretsResponse GetDecryptedSecretsV3Response

	response, err := httpClient.
		R().
		SetResult(&decryptedSecretsResponse).
		SetHeader("User-Agent", USER_AGENT_NAME).
		SetQueryParam("secretPath", request.SecretPath).
		SetQueryParam("workspaceId", request.ProjectID).
		SetQueryParam("environment", request.Environment).
		Get(fmt.Sprintf("%v/v3/secrets/raw", API_HOST_URL))

	if err != nil {
		return GetDecryptedSecretsV3Response{}, fmt.Errorf("CallGetDecryptedSecretsV3: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return GetDecryptedSecretsV3Response{}, fmt.Errorf("CallGetDecryptedSecretsV3: Unsuccessful response: [response=%s]", response)
	}

	responseETag := response.Header().Get("etag")

	decryptedSecretsResponse.Modified = request.ETag != responseETag
	decryptedSecretsResponse.ETag = responseETag

	return decryptedSecretsResponse, nil
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
