package util

import (
	"fmt"
	"os"
)

const (
	CONFIG_FILE_NAME                     = "infisical-config.json"
	CONFIG_FOLDER_NAME                   = ".infisical"
	INFISICAL_WORKSPACE_CONFIG_FILE_NAME = ".infisical.json"
	INFISICAL_TOKEN_NAME                 = "INFISICAL_TOKEN"
	SECRET_TYPE_PERSONAL                 = "personal"
	SECRET_TYPE_SHARED                   = "shared"
)

func GetHomeDir() (string, error) {
	directory, err := os.UserHomeDir()
	return directory, err
}

// write file to given path. If path does not exist throw error
func WriteToFile(fileName string, dataToWrite []byte, filePerm os.FileMode) error {
	err := os.WriteFile(fileName, dataToWrite, filePerm)
	if err != nil {
		return fmt.Errorf("Unable to wrote to file", err)
	}

	return nil
}
