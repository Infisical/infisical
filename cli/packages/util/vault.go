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
		return VAULT_BACKEND_AUTO_MODE, nil
	}

	if configFile.VaultBackendType != VAULT_BACKEND_AUTO_MODE && configFile.VaultBackendType != VAULT_BACKEND_FILE_MODE {
		return VAULT_BACKEND_AUTO_MODE, nil
	}

	return configFile.VaultBackendType, nil
}
