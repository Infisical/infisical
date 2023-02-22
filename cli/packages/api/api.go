package api

import (
	"fmt"

	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/go-resty/resty/v2"
	log "github.com/sirupsen/logrus"
)

const USER_AGENT = "cli"

func CallBatchModifySecretsByWorkspaceAndEnv(httpClient *resty.Client, request BatchModifySecretsByWorkspaceAndEnvRequest) error {
	endpoint := fmt.Sprintf("%v/v2/secrets", config.INFISICAL_URL)
	response, err := httpClient.
		R().
		SetBody(request).
		SetHeader("User-Agent", USER_AGENT).
		Patch(endpoint)

	if err != nil {
		return fmt.Errorf("CallBatchModifySecretsByWorkspaceAndEnv: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return fmt.Errorf("CallBatchModifySecretsByWorkspaceAndEnv: Unsuccessful response: [response=%s]", response)
	}

	return nil
}

func CallBatchCreateSecretsByWorkspaceAndEnv(httpClient *resty.Client, request BatchCreateSecretsByWorkspaceAndEnvRequest) error {
	endpoint := fmt.Sprintf("%v/v2/secrets/", config.INFISICAL_URL)
	response, err := httpClient.
		R().
		SetBody(request).
		SetHeader("User-Agent", USER_AGENT).
		Post(endpoint)

	if err != nil {
		return fmt.Errorf("CallBatchCreateSecretsByWorkspaceAndEnv: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return fmt.Errorf("CallBatchCreateSecretsByWorkspaceAndEnv: Unsuccessful response: [response=%s]", response)
	}

	return nil
}

func CallBatchDeleteSecretsByWorkspaceAndEnv(httpClient *resty.Client, request BatchDeleteSecretsBySecretIdsRequest) error {
	endpoint := fmt.Sprintf("%v/v2/secrets", config.INFISICAL_URL)
	response, err := httpClient.
		R().
		SetBody(request).
		SetHeader("User-Agent", USER_AGENT).
		Delete(endpoint)

	if err != nil {
		return fmt.Errorf("CallBatchDeleteSecretsByWorkspaceAndEnv: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return fmt.Errorf("CallBatchDeleteSecretsByWorkspaceAndEnv: Unsuccessful response: [response=%s]", response)
	}

	return nil
}

func CallGetEncryptedWorkspaceKey(httpClient *resty.Client, request GetEncryptedWorkspaceKeyRequest) (GetEncryptedWorkspaceKeyResponse, error) {
	endpoint := fmt.Sprintf("%v/v2/workspace/%v/encrypted-key", config.INFISICAL_URL, request.WorkspaceId)
	var result GetEncryptedWorkspaceKeyResponse
	response, err := httpClient.
		R().
		SetResult(&result).
		SetHeader("User-Agent", USER_AGENT).
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
		SetHeader("User-Agent", USER_AGENT).
		Get(fmt.Sprintf("%v/v2/service-token", config.INFISICAL_URL))

	if err != nil {
		return GetServiceTokenDetailsResponse{}, fmt.Errorf("CallGetServiceTokenDetails: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return GetServiceTokenDetailsResponse{}, fmt.Errorf("CallGetServiceTokenDetails: Unsuccessful response: [response=%s]", response)
	}

	return tokenDetailsResponse, nil
}

func CallGetSecretsV2(httpClient *resty.Client, request GetEncryptedSecretsV2Request) (GetEncryptedSecretsV2Response, error) {
	var secretsResponse GetEncryptedSecretsV2Response
	response, err := httpClient.
		R().
		SetResult(&secretsResponse).
		SetHeader("User-Agent", USER_AGENT).
		SetQueryParam("environment", request.Environment).
		SetQueryParam("workspaceId", request.WorkspaceId).
		SetQueryParam("tagSlugs", request.TagSlugs).
		Get(fmt.Sprintf("%v/v2/secrets", config.INFISICAL_URL))

	if err != nil {
		return GetEncryptedSecretsV2Response{}, fmt.Errorf("CallGetSecretsV2: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return GetEncryptedSecretsV2Response{}, fmt.Errorf("CallGetSecretsV2: Unsuccessful response: [response=%s]", response)
	}

	return secretsResponse, nil
}

func CallLogin1V2(httpClient *resty.Client, request GetLoginOneV2Request) (GetLoginOneV2Response, error) {
	var loginOneV2Response GetLoginOneV2Response
	response, err := httpClient.
		R().
		SetResult(&loginOneV2Response).
		SetHeader("User-Agent", USER_AGENT).
		SetBody(request).
		Post(fmt.Sprintf("%v/v2/auth/login1", config.INFISICAL_URL))

	if err != nil {
		return GetLoginOneV2Response{}, fmt.Errorf("CallLogin1V2: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return GetLoginOneV2Response{}, fmt.Errorf("CallLogin1V2: Unsuccessful response: [response=%s]", response)
	}

	return loginOneV2Response, nil
}

func CallVerifyMfaToken(httpClient *resty.Client, request VerifyMfaTokenRequest) (*VerifyMfaTokenResponse, *VerifyMfaTokenErrorResponse, error) {
	var verifyMfaTokenResponse VerifyMfaTokenResponse
	var responseError VerifyMfaTokenErrorResponse
	response, err := httpClient.
		R().
		SetResult(&verifyMfaTokenResponse).
		SetHeader("User-Agent", USER_AGENT).
		SetError(&responseError).
		SetBody(request).
		Post(fmt.Sprintf("%v/v2/auth/mfa/verify", config.INFISICAL_URL))

	if err != nil {
		return nil, nil, fmt.Errorf("CallVerifyMfaToken: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return nil, &responseError, nil
	}

	return &verifyMfaTokenResponse, nil, nil
}

func CallLogin2V2(httpClient *resty.Client, request GetLoginTwoV2Request) (GetLoginTwoV2Response, error) {
	var loginTwoV2Response GetLoginTwoV2Response
	response, err := httpClient.
		R().
		SetResult(&loginTwoV2Response).
		SetHeader("User-Agent", USER_AGENT).
		SetBody(request).
		Post(fmt.Sprintf("%v/v2/auth/login2", config.INFISICAL_URL))

	if err != nil {
		return GetLoginTwoV2Response{}, fmt.Errorf("CallLogin2V2: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return GetLoginTwoV2Response{}, fmt.Errorf("CallLogin2V2: Unsuccessful response: [response=%s]", response)
	}

	return loginTwoV2Response, nil
}

func CallGetAllWorkSpacesUserBelongsTo(httpClient *resty.Client) (GetWorkSpacesResponse, error) {
	var workSpacesResponse GetWorkSpacesResponse
	response, err := httpClient.
		R().
		SetResult(&workSpacesResponse).
		SetHeader("User-Agent", USER_AGENT).
		Get(fmt.Sprintf("%v/v1/workspace", config.INFISICAL_URL))

	if err != nil {
		return GetWorkSpacesResponse{}, err
	}

	if response.IsError() {
		return GetWorkSpacesResponse{}, fmt.Errorf("CallGetAllWorkSpacesUserBelongsTo: Unsuccessful response:  [response=%v]", response)
	}

	return workSpacesResponse, nil
}

func CallIsAuthenticated(httpClient *resty.Client) bool {
	var workSpacesResponse GetWorkSpacesResponse
	response, err := httpClient.
		R().
		SetResult(&workSpacesResponse).
		SetHeader("User-Agent", USER_AGENT).
		Post(fmt.Sprintf("%v/v1/auth/checkAuth", config.INFISICAL_URL))

	if err != nil {
		return false
	}

	if response.IsError() {
		log.Debugln(fmt.Errorf("CallIsAuthenticated: Unsuccessful response:  [response=%v]", response))
		return false
	}

	return true
}

func CallGetAccessibleEnvironments(httpClient *resty.Client, request GetAccessibleEnvironmentsRequest) (GetAccessibleEnvironmentsResponse, error) {
	var accessibleEnvironmentsResponse GetAccessibleEnvironmentsResponse
	response, err := httpClient.
		R().
		SetResult(&accessibleEnvironmentsResponse).
		SetHeader("User-Agent", USER_AGENT).
		Get(fmt.Sprintf("%v/v2/workspace/%s/environments", config.INFISICAL_URL, request.WorkspaceId))

	if err != nil {
		return GetAccessibleEnvironmentsResponse{}, err
	}

	if response.IsError() {
		return GetAccessibleEnvironmentsResponse{}, fmt.Errorf("CallGetAccessibleEnvironments: Unsuccessful response:  [response=%v]", response)
	}

	return accessibleEnvironmentsResponse, nil
}
