package util

import (
	"fmt"
	"net/http"
	"os"

	"github.com/Infisical/infisical-merge/packages/config"
)

func GetHomeDir() (string, error) {
	directory, err := os.UserHomeDir()
	return directory, err
}

// write file to given path. If path does not exist throw error
func WriteToFile(fileName string, dataToWrite []byte, filePerm os.FileMode) error {
	err := os.WriteFile(fileName, dataToWrite, filePerm)
	if err != nil {
		return fmt.Errorf("unable to wrote to file [err=%v]", err)
	}

	return nil
}

func ValidateInfisicalAPIConnection() (ok bool) {
	_, err := http.Get(fmt.Sprintf("%v/status", config.INFISICAL_URL))
	return err == nil
}
