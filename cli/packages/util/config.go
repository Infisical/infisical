package util

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/Infisical/infisical/packages/models"
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

func WorkspaceConfigFileExists() bool {
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
