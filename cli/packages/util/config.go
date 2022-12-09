package util

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/Infisical/infisical-merge/packages/models"
	log "github.com/sirupsen/logrus"
)

func WriteInitalConfig(userCredentials *models.UserCredentials) error {
	fullConfigFilePath, fullConfigFileDirPath, err := GetFullConfigFilePath()
	if err != nil {
		return err
	}

	// create directory
	if _, err := os.Stat(fullConfigFileDirPath); errors.Is(err, os.ErrNotExist) {
		err := os.Mkdir(fullConfigFileDirPath, os.ModePerm)
		if err != nil {
			return err
		}
	}

	configFile := models.ConfigFile{
		LoggedInUserEmail: userCredentials.Email,
	}

	configFileMarshalled, err := json.Marshal(configFile)
	if err != nil {
		return err
	}

	// Create file in directory
	err = WriteToFile(fullConfigFilePath, configFileMarshalled, os.ModePerm)
	if err != nil {
		return err
	}

	return err
}

func ConfigFileExists() bool {
	fullConfigFileURI, _, err := GetFullConfigFilePath()
	if err != nil {
		log.Debugln("There was an error when creating the full path to config file", err)
		return false
	}

	if _, err := os.Stat(fullConfigFileURI); err == nil {
		return true
	} else {
		return false
	}
}

func WorkspaceConfigFileExistsInCurrentPath() bool {
	if _, err := os.Stat(INFISICAL_WORKSPACE_CONFIG_FILE_NAME); err == nil {
		return true
	} else {
		log.Debugln(err)
		return false
	}
}

func GetWorkSpaceFromFile() (models.WorkspaceConfigFile, error) {
	configFileAsBytes, err := os.ReadFile(INFISICAL_WORKSPACE_CONFIG_FILE_NAME)
	if err != nil {
		return models.WorkspaceConfigFile{}, err
	}

	var workspaceConfigFile models.WorkspaceConfigFile
	err = json.Unmarshal(configFileAsBytes, &workspaceConfigFile)
	if err != nil {
		return models.WorkspaceConfigFile{}, err
	}

	return workspaceConfigFile, nil
}

func GetFullConfigFilePath() (fullPathToFile string, fullPathToDirectory string, err error) {
	homeDir, err := GetHomeDir()
	if err != nil {
		return "", "", err
	}

	fullPath := fmt.Sprintf("%s/%s/%s", homeDir, CONFIG_FOLDER_NAME, CONFIG_FILE_NAME)
	fullDirPath := fmt.Sprintf("%s/%s", homeDir, CONFIG_FOLDER_NAME)
	return fullPath, fullDirPath, err
}

// Given a path to a workspace config, unmarshal workspace config
func GetWorkspaceConfigByPath(path string) (workspaceConfig models.WorkspaceConfigFile, err error) {
	workspaceConfigFileAsBytes, err := os.ReadFile(path)
	if err != nil {
		return models.WorkspaceConfigFile{}, fmt.Errorf("GetWorkspaceConfigByPath: Unable to read workspace config file because [%s]", err)
	}

	var workspaceConfigFile models.WorkspaceConfigFile
	err = json.Unmarshal(workspaceConfigFileAsBytes, &workspaceConfigFile)
	if err != nil {
		return models.WorkspaceConfigFile{}, fmt.Errorf("GetWorkspaceConfigByPath: Unable to unmarshal workspace config file because [%s]", err)
	}

	return workspaceConfigFile, nil
}

// Will get the list of .infisical.json files that are located
// within the root of each sub folder from where the CLI is ran from
func GetAllWorkSpaceConfigsStartingFromCurrentPath() (workspaces []models.WorkspaceConfigFile, err error) {
	currentDir, err := os.Getwd()
	if err != nil {
		return nil, fmt.Errorf("GetAllProjectConfigs: unable to get the current directory because [%s]", err)
	}

	files, err := os.ReadDir(currentDir)
	if err != nil {
		return nil, fmt.Errorf("GetAllProjectConfigs: unable to read the contents of the current directory because [%s]", err)
	}

	listOfWorkSpaceConfigs := []models.WorkspaceConfigFile{}
	for _, file := range files {
		if !file.IsDir() && file.Name() == INFISICAL_WORKSPACE_CONFIG_FILE_NAME {
			pathToWorkspaceConfigFile := currentDir + "/" + INFISICAL_WORKSPACE_CONFIG_FILE_NAME

			workspaceConfig, err := GetWorkspaceConfigByPath(pathToWorkspaceConfigFile)
			if err != nil {
				return nil, fmt.Errorf("GetAllProjectConfigs: Unable to get config file because [%s]", err)
			}

			listOfWorkSpaceConfigs = append(listOfWorkSpaceConfigs, workspaceConfig)

		} else if file.IsDir() {
			pathToSubFolder := currentDir + "/" + file.Name()
			pathToMaybeWorkspaceConfigFile := pathToSubFolder + "/" + INFISICAL_WORKSPACE_CONFIG_FILE_NAME

			_, err := os.Stat(pathToMaybeWorkspaceConfigFile)
			if err != nil {
				continue // workspace config file doesn't exist
			}

			workspaceConfig, err := GetWorkspaceConfigByPath(pathToMaybeWorkspaceConfigFile)
			if err != nil {
				return nil, fmt.Errorf("GetAllProjectConfigs: Unable to get config file because [%s]", err)
			}

			listOfWorkSpaceConfigs = append(listOfWorkSpaceConfigs, workspaceConfig)
		}
	}

	return listOfWorkSpaceConfigs, nil
}
