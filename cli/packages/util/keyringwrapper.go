package util

import (
	"encoding/base64"
	"fmt"

	"github.com/rs/zerolog/log"
	"github.com/zalando/go-keyring"
)

const MAIN_KEYRING_SERVICE = "infisical-cli"

type TimeoutError struct {
	message string
}

func (e *TimeoutError) Error() string {
	return e.message
}

func SetValueInKeyring(key, value string) error {
	currentVaultBackend, err := GetCurrentVaultBackend()
	if err != nil {
		PrintErrorAndExit(1, err, "Unable to get current vault. Tip: run [infisical rest] then try again")
	}

	err = keyring.Set(currentVaultBackend, MAIN_KEYRING_SERVICE, key, value)

	if err != nil {
		log.Debug().Msg(fmt.Sprintf("Error while setting default keyring: %v", err))
		configFile, _ := GetConfigFile()

		if configFile.VaultBackendPassphrase == "" {
			encodedPassphrase := base64.StdEncoding.EncodeToString([]byte(GenerateRandomString(10))) // generate random passphrase
			configFile.VaultBackendPassphrase = encodedPassphrase
			configFile.VaultBackendType = VAULT_BACKEND_FILE_MODE
			err = WriteConfigFile(&configFile)
			if err != nil {
				return err
			}

			// We call this function at last to trigger the environment variable to be set
			GetConfigFile()
		}

		err = keyring.Set(VAULT_BACKEND_FILE_MODE, MAIN_KEYRING_SERVICE, key, value)
		log.Debug().Msg(fmt.Sprintf("Error while setting file keyring: %v", err))
	}

	return err
}

func GetValueInKeyring(key string) (string, error) {
	currentVaultBackend, err := GetCurrentVaultBackend()
	if err != nil {
		PrintErrorAndExit(1, err, "Unable to get current vault. Tip: run [infisical reset] then try again")
	}
	return keyring.Get(currentVaultBackend, MAIN_KEYRING_SERVICE, key)

}

func DeleteValueInKeyring(key string) error {
	currentVaultBackend, err := GetCurrentVaultBackend()
	if err != nil {
		return err
	}

	return keyring.Delete(currentVaultBackend, MAIN_KEYRING_SERVICE, key)
}
