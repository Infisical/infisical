package config

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"

	"github.com/Infisical/infisical-merge/packages/models"
)

var INFISICAL_URL string
var INFISICAL_URL_MANUAL_OVERRIDE string
var INFISICAL_LOGIN_URL string

func GetConfigFile() (models.ConfigFile, error) {
	directory, err := os.UserHomeDir()
	if err != nil {
		return models.ConfigFile{}, err
	}

	fullConfigFilePath := fmt.Sprintf("%s/%s/%s", directory, ".infisical", "infisical-config.json")
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

	if configFile.VaultBackendPassphrase != "" {
		decodedPassphrase, err := base64.StdEncoding.DecodeString(configFile.VaultBackendPassphrase)
		if err != nil {
			return models.ConfigFile{}, fmt.Errorf("GetConfigFile: Unable to decode base64 passphrase [err=%s]", err)
		}
		os.Setenv("INFISICAL_VAULT_FILE_PASSPHRASE", string(decodedPassphrase))
	}

	return configFile, nil
}
