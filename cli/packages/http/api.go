package http

import (
	"fmt"

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/go-resty/resty/v2"
)

func CallBatchModifySecretsByWorkspaceAndEnv(httpClient *resty.Client, request models.BatchModifySecretsByWorkspaceAndEnvRequest) error {
	endpoint := fmt.Sprintf("%v/v2/secret/batch-modify/workspace/%v/environment/%v", util.INFISICAL_URL, request.WorkspaceId, request.EnvironmentName)
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
	endpoint := fmt.Sprintf("%v/v2/secret/batch-create/workspace/%v/environment/%v", util.INFISICAL_URL, request.WorkspaceId, request.EnvironmentName)
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
	endpoint := fmt.Sprintf("%v/v2/secret/batch/workspace/%v/environment/%v", util.INFISICAL_URL, request.WorkspaceId, request.EnvironmentName)
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
	endpoint := fmt.Sprintf("%v/v1/key/%v/latest", util.INFISICAL_URL, request.WorkspaceId)
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

func CallGetEncryptedSecretsByWorkspaceIdAndEnv(httpClient resty.Client, request models.GetSecretsByWorkspaceIdAndEnvironmentRequest) (models.PullSecretsResponse, error) {
	var pullSecretsRequestResponse models.PullSecretsResponse
	response, err := httpClient.
		R().
		SetQueryParam("environment", request.EnvironmentName).
		SetQueryParam("channel", "cli").
		SetResult(&pullSecretsRequestResponse).
		Get(fmt.Sprintf("%v/v1/secret/%v", util.INFISICAL_URL, request.WorkspaceId))

	if err != nil {
		return models.PullSecretsResponse{}, fmt.Errorf("CallGetEncryptedSecretsByWorkspaceIdAndEnv: Unable to complete api request [err=%s]", err)
	}

	if response.StatusCode() > 299 {
		return models.PullSecretsResponse{}, fmt.Errorf("CallGetEncryptedSecretsByWorkspaceIdAndEnv: Unsuccessful response: [response=%s]", response)
	}

	return pullSecretsRequestResponse, nil
}
