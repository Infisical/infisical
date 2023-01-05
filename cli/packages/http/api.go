package http

import (
	"fmt"

	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/go-resty/resty/v2"
)

func CallBatchModifySecretsByWorkspaceAndEnv(httpClient *resty.Client, request models.BatchModifySecretsByWorkspaceAndEnvRequest) error {
	endpoint := fmt.Sprintf("%v/v2/secret/batch-modify/workspace/%v/environment/%v", config.INFISICAL_URL, request.WorkspaceId, request.EnvironmentName)
	response, err := httpClient.
		R().
		SetBody(request).
		Patch(endpoint)

	if err != nil {
		return fmt.Errorf("CallBatchModifySecretsByWorkspaceAndEnv: Unable to complete api request [err=%s]", err)
	}

	if response.StatusCode() > 299 {
		return fmt.Errorf("CallBatchModifySecretsByWorkspaceAndEnv: Unsuccessful response: [response=%s]", response)
	}

	return nil
}

func CallBatchCreateSecretsByWorkspaceAndEnv(httpClient *resty.Client, request models.BatchCreateSecretsByWorkspaceAndEnvRequest) error {
	endpoint := fmt.Sprintf("%v/v2/secret/batch-create/workspace/%v/environment/%v", config.INFISICAL_URL, request.WorkspaceId, request.EnvironmentName)
	response, err := httpClient.
		R().
		SetBody(request).
		Post(endpoint)

	if err != nil {
		return fmt.Errorf("CallBatchCreateSecretsByWorkspaceAndEnv: Unable to complete api request [err=%s]", err)
	}

	if response.StatusCode() > 299 {
		return fmt.Errorf("CallBatchCreateSecretsByWorkspaceAndEnv: Unsuccessful response: [response=%s]", response)
	}

	return nil
}

func CallBatchDeleteSecretsByWorkspaceAndEnv(httpClient *resty.Client, request models.BatchDeleteSecretsBySecretIdsRequest) error {
	endpoint := fmt.Sprintf("%v/v2/secret/batch/workspace/%v/environment/%v", config.INFISICAL_URL, request.WorkspaceId, request.EnvironmentName)
	response, err := httpClient.
		R().
		SetBody(request).
		Delete(endpoint)

	if err != nil {
		return fmt.Errorf("CallBatchDeleteSecretsByWorkspaceAndEnv: Unable to complete api request [err=%s]", err)
	}

	if response.StatusCode() > 299 {
		return fmt.Errorf("CallBatchDeleteSecretsByWorkspaceAndEnv: Unsuccessful response: [response=%s]", response)
	}

	return nil
}

func CallGetEncryptedWorkspaceKey(httpClient *resty.Client, request models.GetEncryptedWorkspaceKeyRequest) (models.GetEncryptedWorkspaceKeyResponse, error) {
	endpoint := fmt.Sprintf("%v/v2/workspace/%v/encrypted-key", config.INFISICAL_URL, request.WorkspaceId)
	var result models.GetEncryptedWorkspaceKeyResponse
	response, err := httpClient.
		R().
		SetResult(&result).
		Get(endpoint)

	if err != nil {
		return models.GetEncryptedWorkspaceKeyResponse{}, fmt.Errorf("CallGetEncryptedWorkspaceKey: Unable to complete api request [err=%s]", err)
	}

	if response.StatusCode() > 299 {
		return models.GetEncryptedWorkspaceKeyResponse{}, fmt.Errorf("CallGetEncryptedWorkspaceKey: Unsuccessful response: [response=%s]", response)
	}

	return result, nil
}

func CallGetServiceTokenDetailsV2(httpClient *resty.Client) (models.GetServiceTokenDetailsResponse, error) {
	var tokenDetailsResponse models.GetServiceTokenDetailsResponse
	response, err := httpClient.
		R().
		SetResult(&tokenDetailsResponse).
		Get(fmt.Sprintf("%v/v2/service-token", config.INFISICAL_URL))

	if err != nil {
		return models.GetServiceTokenDetailsResponse{}, fmt.Errorf("CallGetServiceTokenDetails: Unable to complete api request [err=%s]", err)
	}

	if response.StatusCode() > 299 {
		return models.GetServiceTokenDetailsResponse{}, fmt.Errorf("CallGetServiceTokenDetails: Unsuccessful response: [response=%s]", response)
	}

	return tokenDetailsResponse, nil
}

func CallGetSecretsV2(httpClient *resty.Client, request models.GetEncryptedSecretsV2Request) (models.GetEncryptedSecretsV2Response, error) {
	var secretsResponse models.GetEncryptedSecretsV2Response
	response, err := httpClient.
		R().
		SetResult(&secretsResponse).
		SetQueryParam("environment", request.EnvironmentName).
		Get(fmt.Sprintf("%v/v2/secret/workspace/%v", config.INFISICAL_URL, request.WorkspaceId))

	if err != nil {
		return models.GetEncryptedSecretsV2Response{}, fmt.Errorf("CallGetSecretsV2: Unable to complete api request [err=%s]", err)
	}

	if response.StatusCode() > 299 {
		return models.GetEncryptedSecretsV2Response{}, fmt.Errorf("CallGetSecretsV2: Unsuccessful response: [response=%s]", response)
	}

	return secretsResponse, nil
}
