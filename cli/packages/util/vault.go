package util

import (
	"fmt"
)

func GetCurrentVaultBackend() (string, error) {
	configFile, err := GetConfigFile()
	if err != nil {
		return "", fmt.Errorf("getCurrentVaultBackend: unable to get config file [err=%s]", err)
	}

	if configFile.VaultBackendType == "" {
		return "auto", nil
	}

	if configFile.VaultBackendType != "auto" && configFile.VaultBackendType != "file" {
		return "auto", nil
	}

	return configFile.VaultBackendType, nil
}
