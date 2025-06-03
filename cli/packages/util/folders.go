package util

import (
	"fmt"
	"strings"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/rs/zerolog/log"
)

func GetAllFolders(params models.GetAllFoldersParameters) ([]models.SingleFolder, error) {

	var foldersToReturn []models.SingleFolder
	var folderErr error
	if params.InfisicalToken == "" && params.UniversalAuthAccessToken == "" {
		RequireLogin()

		log.Debug().Msg("GetAllFolders: Trying to fetch folders using logged in details")

		loggedInUserDetails, err := GetCurrentLoggedInUserDetails(true)
		if err != nil {
			return nil, err
		}

		if loggedInUserDetails.LoginExpired {
			loggedInUserDetails = EstablishUserLoginSession()
		}

		if params.WorkspaceId == "" {
			workspaceFile, err := GetWorkSpaceFromFile()
			if err != nil {
				PrintErrorMessageAndExit("Please either run infisical init to connect to a project or pass in project id with --projectId flag")
			}
			params.WorkspaceId = workspaceFile.WorkspaceId
		}

		folders, err := GetFoldersViaJTW(loggedInUserDetails.UserCredentials.JTWToken, params.WorkspaceId, params.Environment, params.FoldersPath)
		folderErr = err
		foldersToReturn = folders
	} else if params.InfisicalToken != "" {
		log.Debug().Msg("GetAllFolders: Trying to fetch folders using service token")

		// get folders via service token
		folders, err := GetFoldersViaServiceToken(params.InfisicalToken, params.WorkspaceId, params.Environment, params.FoldersPath)
		folderErr = err
		foldersToReturn = folders
	} else if params.UniversalAuthAccessToken != "" {
		log.Debug().Msg("GetAllFolders: Trying to fetch folders using universal auth")

		if params.WorkspaceId == "" {
			PrintErrorMessageAndExit("Project ID is required when using machine identity")
		}

		// get folders via machine identity
		folders, err := GetFoldersViaMachineIdentity(params.UniversalAuthAccessToken, params.WorkspaceId, params.Environment, params.FoldersPath)
		folderErr = err
		foldersToReturn = folders
	}
	return foldersToReturn, folderErr
}

func GetFoldersViaJTW(JTWToken string, workspaceId string, environmentName string, foldersPath string) ([]models.SingleFolder, error) {
	// set up resty client
	httpClient, err := GetRestyClientWithCustomHeaders()
	if err != nil {
		return nil, err
	}

	httpClient.SetAuthToken(JTWToken).
		SetHeader("Accept", "application/json")

	getFoldersRequest := api.GetFoldersV1Request{
		WorkspaceId: workspaceId,
		Environment: environmentName,
		FoldersPath: foldersPath,
	}

	apiResponse, err := api.CallGetFoldersV1(httpClient, getFoldersRequest)
	if err != nil {
		return nil, err
	}

	var folders []models.SingleFolder

	for _, folder := range apiResponse.Folders {
		folders = append(folders, models.SingleFolder{
			Name: folder.Name,
			ID:   folder.ID,
		})
	}

	return folders, nil
}

func GetFoldersViaServiceToken(fullServiceToken string, workspaceId string, environmentName string, foldersPath string) ([]models.SingleFolder, error) {
	serviceTokenParts := strings.SplitN(fullServiceToken, ".", 4)
	if len(serviceTokenParts) < 4 {
		return nil, fmt.Errorf("invalid service token entered. Please double check your service token and try again")
	}

	serviceToken := fmt.Sprintf("%v.%v.%v", serviceTokenParts[0], serviceTokenParts[1], serviceTokenParts[2])

	httpClient, err := GetRestyClientWithCustomHeaders()
	if err != nil {
		return nil, fmt.Errorf("unable to get client with custom headers [err=%v]", err)
	}

	httpClient.SetAuthToken(serviceToken).
		SetHeader("Accept", "application/json")

	serviceTokenDetails, err := api.CallGetServiceTokenDetailsV2(httpClient)
	if err != nil {
		return nil, fmt.Errorf("unable to get service token details. [err=%v]", err)
	}

	// if multiple scopes are there then user needs to specify which environment and folder path
	if environmentName == "" {
		if len(serviceTokenDetails.Scopes) != 1 {
			return nil, fmt.Errorf("you need to provide the --env for multiple environment scoped token")
		} else {
			environmentName = serviceTokenDetails.Scopes[0].Environment
		}
	}

	getFoldersRequest := api.GetFoldersV1Request{
		WorkspaceId: serviceTokenDetails.Workspace,
		Environment: environmentName,
		FoldersPath: foldersPath,
	}

	apiResponse, err := api.CallGetFoldersV1(httpClient, getFoldersRequest)
	if err != nil {
		return nil, fmt.Errorf("unable to get folders. [err=%v]", err)
	}

	var folders []models.SingleFolder

	for _, folder := range apiResponse.Folders {
		folders = append(folders, models.SingleFolder{
			Name: folder.Name,
			ID:   folder.ID,
		})
	}

	return folders, nil
}

func GetFoldersViaMachineIdentity(accessToken string, workspaceId string, envSlug string, foldersPath string) ([]models.SingleFolder, error) {
	httpClient, err := GetRestyClientWithCustomHeaders()
	if err != nil {
		return nil, err
	}

	httpClient.SetAuthToken(accessToken).
		SetHeader("Accept", "application/json")

	getFoldersRequest := api.GetFoldersV1Request{
		WorkspaceId: workspaceId,
		Environment: envSlug,
		FoldersPath: foldersPath,
	}

	apiResponse, err := api.CallGetFoldersV1(httpClient, getFoldersRequest)
	if err != nil {
		return nil, err
	}

	var folders []models.SingleFolder

	for _, folder := range apiResponse.Folders {
		folders = append(folders, models.SingleFolder{
			Name: folder.Name,
			ID:   folder.ID,
		})
	}

	return folders, nil
}

// CreateFolder creates a folder in Infisical
func CreateFolder(params models.CreateFolderParameters) (models.SingleFolder, error) {

	// If no token is provided, we will try to get the token from the current logged in user
	if params.InfisicalToken == "" {
		RequireLogin()
		loggedInUserDetails, err := GetCurrentLoggedInUserDetails(true)

		if err != nil {
			return models.SingleFolder{}, err
		}

		if loggedInUserDetails.LoginExpired {
			loggedInUserDetails = EstablishUserLoginSession()
		}

		params.InfisicalToken = loggedInUserDetails.UserCredentials.JTWToken
	}

	// set up resty client
	httpClient, err := GetRestyClientWithCustomHeaders()
	if err != nil {
		return models.SingleFolder{}, err
	}

	httpClient.SetAuthToken(params.InfisicalToken).
		SetHeader("Accept", "application/json").
		SetHeader("Content-Type", "application/json")

	createFolderRequest := api.CreateFolderV1Request{
		WorkspaceId: params.WorkspaceId,
		Environment: params.Environment,
		FolderName:  params.FolderName,
		Path:        params.FolderPath,
	}

	apiResponse, err := api.CallCreateFolderV1(httpClient, createFolderRequest)
	if err != nil {
		return models.SingleFolder{}, err
	}

	folder := apiResponse.Folder

	return models.SingleFolder{
		Name: folder.Name,
		ID:   folder.ID,
	}, nil
}

func DeleteFolder(params models.DeleteFolderParameters) ([]models.SingleFolder, error) {

	// If no token is provided, we will try to get the token from the current logged in user
	if params.InfisicalToken == "" {
		RequireLogin()

		loggedInUserDetails, err := GetCurrentLoggedInUserDetails(true)

		if err != nil {
			return nil, err
		}

		if loggedInUserDetails.LoginExpired {
			loggedInUserDetails = EstablishUserLoginSession()
		}

		params.InfisicalToken = loggedInUserDetails.UserCredentials.JTWToken
	}

	// set up resty client
	httpClient, err := GetRestyClientWithCustomHeaders()
	if err != nil {
		return nil, err
	}

	httpClient.SetAuthToken(params.InfisicalToken).
		SetHeader("Accept", "application/json").
		SetHeader("Content-Type", "application/json")

	deleteFolderRequest := api.DeleteFolderV1Request{
		WorkspaceId: params.WorkspaceId,
		Environment: params.Environment,
		FolderName:  params.FolderName,
		Directory:   params.FolderPath,
	}

	apiResponse, err := api.CallDeleteFolderV1(httpClient, deleteFolderRequest)
	if err != nil {
		return nil, err
	}

	var folders []models.SingleFolder

	for _, folder := range apiResponse.Folders {
		folders = append(folders, models.SingleFolder{
			Name: folder.Name,
			ID:   folder.ID,
		})
	}

	return folders, nil
}
