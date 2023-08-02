package api

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/go-resty/resty/v2"
	"github.com/rs/zerolog/log"
)

const USER_AGENT = "cli"

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

	PrintApiRequestDebugLog(response)

	if response.IsError() {
		return GetEncryptedWorkspaceKeyResponse{}, PrintApiRequestError(response)
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

	PrintApiRequestDebugLog(response)

	if err != nil {
		return GetServiceTokenDetailsResponse{}, fmt.Errorf("CallGetServiceTokenDetails: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return GetServiceTokenDetailsResponse{}, PrintApiRequestError(response)
	}

	return tokenDetailsResponse, nil
}

func CallLogin1V2(httpClient *resty.Client, request GetLoginOneV2Request) (GetLoginOneV2Response, error) {
	var loginOneV2Response GetLoginOneV2Response
	response, err := httpClient.
		R().
		SetResult(&loginOneV2Response).
		SetHeader("User-Agent", USER_AGENT).
		SetBody(request).
		Post(fmt.Sprintf("%v/v2/auth/login1", config.INFISICAL_URL))

	PrintApiRequestDebugLog(response)

	if err != nil {
		return GetLoginOneV2Response{}, fmt.Errorf("CallLogin1V2: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return GetLoginOneV2Response{}, PrintApiRequestError(response)
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

	cookies := response.Cookies()
	// Find a cookie by name
	cookieName := "jid"
	var refreshToken *http.Cookie
	for _, cookie := range cookies {
		if cookie.Name == cookieName {
			refreshToken = cookie
			break
		}
	}

	// When MFA is enabled
	if refreshToken != nil {
		verifyMfaTokenResponse.RefreshToken = refreshToken.Value
	}

	PrintApiRequestDebugLog(response)

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

	cookies := response.Cookies()
	// Find a cookie by name
	cookieName := "jid"
	var refreshToken *http.Cookie
	for _, cookie := range cookies {
		if cookie.Name == cookieName {
			refreshToken = cookie
			break
		}
	}

	// When MFA is enabled
	if refreshToken != nil {
		loginTwoV2Response.RefreshToken = refreshToken.Value
	}

	PrintApiRequestDebugLog(response)

	if err != nil {
		return GetLoginTwoV2Response{}, fmt.Errorf("CallLogin2V2: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return GetLoginTwoV2Response{}, PrintApiRequestError(response)
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

	PrintApiRequestDebugLog(response)

	if err != nil {
		return GetWorkSpacesResponse{}, err
	}

	if response.IsError() {
		return GetWorkSpacesResponse{}, PrintApiRequestError(response)
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

	PrintApiRequestDebugLog(response)

	if err != nil {
		return false
	}

	if response.IsError() {
		log.Debug().Msgf("CallIsAuthenticated: Unsuccessful response:  [response=%v]", response)
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

	PrintApiRequestDebugLog(response)

	if err != nil {
		return GetAccessibleEnvironmentsResponse{}, err
	}

	if response.IsError() {
		return GetAccessibleEnvironmentsResponse{}, PrintApiRequestError(response)
	}

	return accessibleEnvironmentsResponse, nil
}

func CallGetNewAccessTokenWithRefreshToken(httpClient *resty.Client, refreshToken string) (GetNewAccessTokenWithRefreshTokenResponse, error) {
	var newAccessToken GetNewAccessTokenWithRefreshTokenResponse
	response, err := httpClient.
		R().
		SetResult(&newAccessToken).
		SetHeader("User-Agent", USER_AGENT).
		SetCookie(&http.Cookie{
			Name:  "jid",
			Value: refreshToken,
		}).
		Post(fmt.Sprintf("%v/v1/auth/token", config.INFISICAL_URL))

	PrintApiRequestDebugLog(response)

	if err != nil {
		return GetNewAccessTokenWithRefreshTokenResponse{}, err
	}

	if response.IsError() {
		return GetNewAccessTokenWithRefreshTokenResponse{}, PrintApiRequestError(response)
	}

	return newAccessToken, nil
}

func CallGetSecretsV3(httpClient *resty.Client, request GetEncryptedSecretsV3Request) (GetEncryptedSecretsV3Response, error) {
	var secretsResponse GetEncryptedSecretsV3Response

	httpRequest := httpClient.
		R().
		SetResult(&secretsResponse).
		SetHeader("User-Agent", USER_AGENT).
		SetQueryParam("environment", request.Environment).
		SetQueryParam("workspaceId", request.WorkspaceId)

	if request.IncludeImport {
		httpRequest.SetQueryParam("include_imports", "true")
	}

	if request.SecretPath != "" {
		httpRequest.SetQueryParam("secretPath", request.SecretPath)
	}

	response, err := httpRequest.Get(fmt.Sprintf("%v/v3/secrets", config.INFISICAL_URL))

	PrintApiRequestDebugLog(response)

	if err != nil {
		return GetEncryptedSecretsV3Response{}, fmt.Errorf("CallGetSecretsV3: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		if response.StatusCode() == 401 {
			return GetEncryptedSecretsV3Response{}, fmt.Errorf("CallGetSecretsV3: Request to access secrets with [environment=%v] [path=%v] [workspaceId=%v] is denied. Please check if your authentication method has access to requested scope", request.Environment, request.SecretPath, request.WorkspaceId)
		} else {
			return GetEncryptedSecretsV3Response{}, fmt.Errorf("CallGetSecretsV3: Unsuccessful response with http [status=%v]. Please make sure your secret path, workspace and environment name are all correct", response.StatusCode())
		}
	}

	return secretsResponse, nil
}

func CallCreateSecretsV3(httpClient *resty.Client, request CreateSecretV3Request) error {
	var secretsResponse GetEncryptedSecretsV3Response
	response, err := httpClient.
		R().
		SetResult(&secretsResponse).
		SetHeader("User-Agent", USER_AGENT).
		SetBody(request).
		Post(fmt.Sprintf("%v/v3/secrets/%s", config.INFISICAL_URL, request.SecretName))

	PrintApiRequestDebugLog(response)

	if err != nil {
		return fmt.Errorf("CallCreateSecretsV3: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return fmt.Errorf("CallCreateSecretsV3: Unsuccessful response with http [status=%v]. Please make sure your secret path, workspace and environment name are all correct", response.StatusCode())
	}

	return nil
}

func CallDeleteSecretsV3(httpClient *resty.Client, request DeleteSecretV3Request) error {
	var secretsResponse GetEncryptedSecretsV3Response
	response, err := httpClient.
		R().
		SetResult(&secretsResponse).
		SetHeader("User-Agent", USER_AGENT).
		SetBody(request).
		Delete(fmt.Sprintf("%v/v3/secrets/%s", config.INFISICAL_URL, request.SecretName))

	PrintApiRequestDebugLog(response)

	if err != nil {
		return fmt.Errorf("CallDeleteSecretsV3: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return fmt.Errorf("CallDeleteSecretsV3: Unsuccessful response with http [status=%v]. Please make sure your secret path, workspace and environment name are all correct", response.StatusCode())
	}

	return nil
}

func CallUpdateSecretsV3(httpClient *resty.Client, request UpdateSecretByNameV3Request) error {
	var secretsResponse GetEncryptedSecretsV3Response
	response, err := httpClient.
		R().
		SetResult(&secretsResponse).
		SetHeader("User-Agent", USER_AGENT).
		SetBody(request).
		Patch(fmt.Sprintf("%v/v3/secrets/%s", config.INFISICAL_URL, request.SecretName))

	PrintApiRequestDebugLog(response)

	if err != nil {
		return fmt.Errorf("CallUpdateSecretsV3: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return fmt.Errorf("CallUpdateSecretsV3: Unsuccessful response. Please make sure your secret path, workspace and environment name are all correct [response=%s]", response)
	}

	return nil
}

func CallGetSingleSecretByNameV3(httpClient *resty.Client, request CreateSecretV3Request) error {
	var secretsResponse GetEncryptedSecretsV3Response
	response, err := httpClient.
		R().
		SetResult(&secretsResponse).
		SetHeader("User-Agent", USER_AGENT).
		SetBody(request).
		Post(fmt.Sprintf("%v/v3/secrets/%s", config.INFISICAL_URL, request.SecretName))

	PrintApiRequestDebugLog(response)

	if err != nil {
		return fmt.Errorf("CallGetSingleSecretByNameV3: Unable to complete api request [err=%s]", err)
	}

	if response.IsError() {
		return fmt.Errorf("CallGetSingleSecretByNameV3: Unsuccessful response. Please make sure your secret path, workspace and environment name are all correct [response=%s]", response)
	}

	return nil
}

// API helper
func PrintApiRequestError(response *resty.Response) error {
	method := strings.ToUpper(response.Request.Method)
	url := response.Request.URL
	responseStatus := response.StatusCode()
	return fmt.Errorf("request to call %v %v resulted in response status %v", method, url, responseStatus)
}

func PrintApiRequestDebugLog(response *resty.Response) {
	method := strings.ToUpper(response.Request.Method)
	url := response.Request.URL
	log.Debug().Msgf("requesting to call %v %v with [request=%v] returned [response=%v]", method, url, response.Request, response.RawResponse)
}
