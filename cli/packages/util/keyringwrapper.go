package util

import (
	"encoding/base64"

	"github.com/manifoldco/promptui"
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
		configFile, _ := GetConfigFile()

		if configFile.VaultBackendPassphrase == "" {
			PrintWarning("System keyring could not be used, falling back to `file` vault for sensitive data storage.")
			passphrasePrompt := promptui.Prompt{
				Label: "Enter the passphrase to use for keyring encryption",
			}
			passphrase, err := passphrasePrompt.Run()
			if err != nil {
				return err
			}

			encodedPassphrase := base64.StdEncoding.EncodeToString([]byte(passphrase))
			configFile.VaultBackendPassphrase = encodedPassphrase
			err = WriteConfigFile(&configFile)
			if err != nil {
				return err
			}

			// We call this function at last to trigger the environment variable to be set
			GetConfigFile()
		}

		err = keyring.Set(VAULT_BACKEND_FILE_MODE, MAIN_KEYRING_SERVICE, key, value)
	}

	return err
}

func GetValueInKeyring(key string) (string, error) {
	currentVaultBackend, err := GetCurrentVaultBackend()
	if err != nil {
		PrintErrorAndExit(1, err, "Unable to get current vault. Tip: run [infisical reset] then try again")
	}

	value, err := keyring.Get(currentVaultBackend, MAIN_KEYRING_SERVICE, key)

	if err != nil {
		value, err = keyring.Get(VAULT_BACKEND_FILE_MODE, MAIN_KEYRING_SERVICE, key)
	}
	return value, err

}

func DeleteValueInKeyring(key string) error {
	currentVaultBackend, err := GetCurrentVaultBackend()
	if err != nil {
		return err
	}

	err = keyring.Delete(currentVaultBackend, MAIN_KEYRING_SERVICE, key)

	if err != nil {
		err = keyring.Delete(VAULT_BACKEND_FILE_MODE, MAIN_KEYRING_SERVICE, key)
	}

	return err
}
