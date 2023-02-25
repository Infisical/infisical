package util

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

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

	// get existing config
	existingConfigFile, err := GetConfigFile()
	if err != nil {
		return fmt.Errorf("writeInitalConfig: unable to write config file because [err=%s]", err)
	}

	configFile := models.ConfigFile{
		LoggedInUserEmail: userCredentials.Email,
		VaultBackendType:  existingConfigFile.VaultBackendType,
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
	cfgFile, err := FindWorkspaceConfigFile()
	if err != nil {
		return models.WorkspaceConfigFile{}, err
	}

	configFileAsBytes, err := os.ReadFile(cfgFile)
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

// FindWorkspaceConfigFile searches for a .infisical.json file in the current directory and all parent directories.
func FindWorkspaceConfigFile() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}

	for {
		path := filepath.Join(dir, INFISICAL_WORKSPACE_CONFIG_FILE_NAME)
		_, err := os.Stat(path)
		if err == nil {
			// file found
			return path, nil
		}

		// check if we have reached the root directory
		if dir == filepath.Dir(dir) {
			break
		}

		// move up one directory
		dir = filepath.Dir(dir)
	}

	// file not found
	return "", fmt.Errorf("file not found: %s", INFISICAL_WORKSPACE_CONFIG_FILE_NAME)

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

// Get the infisical config file and if it doesn't exist, return empty config model, otherwise raise error
func GetConfigFile() (models.ConfigFile, error) {
	fullConfigFilePath, _, err := GetFullConfigFilePath()
	if err != nil {
		return models.ConfigFile{}, err
	}

	configFileAsBytes, err := os.ReadFile(fullConfigFilePath)
	if err != nil {
		if err, ok := err.(*os.PathError); ok {
			return models.ConfigFile{}, nil
		} else {
			return models.ConfigFile{}, err
		}
	}

	var configFile models.ConfigFile
	err = json.Unmarshal(configFileAsBytes, &configFile)
	if err != nil {
		return models.ConfigFile{}, err
	}

	return configFile, nil
}

// Write a ConfigFile to disk. Raise error if unable to save the model to ask
func WriteConfigFile(configFile *models.ConfigFile) error {
	fullConfigFilePath, fullConfigFileDirPath, err := GetFullConfigFilePath()
	if err != nil {
		return fmt.Errorf("writeConfigFile: unable to write config file because an error occurred when getting config file path [err=%s]", err)
	}

	configFileMarshalled, err := json.Marshal(configFile)
	if err != nil {
		return fmt.Errorf("writeConfigFile: unable to write config file because an error occurred when marshalling the config file [err=%s]", err)
	}

	// check if config folder exists and if not create it
	if _, err := os.Stat(fullConfigFileDirPath); errors.Is(err, os.ErrNotExist) {
		err := os.Mkdir(fullConfigFileDirPath, os.ModePerm)
		if err != nil {
			return err
		}
	}

	// Create file in directory
	err = os.WriteFile(fullConfigFilePath, configFileMarshalled, os.ModePerm)
	if err != nil {
		return fmt.Errorf("writeConfigFile: Unable to write to file [err=%s]", err)
	}

	if err != nil {
		return fmt.Errorf("writeConfigFile: unable to write config file because an error occurred when write the config to file [err=%s]", err)

	}

	return nil
}
