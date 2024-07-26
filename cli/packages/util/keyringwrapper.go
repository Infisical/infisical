package util

import (
	"strings"

	"github.com/fatih/color"
	"github.com/zalando/go-keyring"
)

const MAIN_KEYRING_SERVICE = "infisical-cli"

func keyringNotConfigured(err error) bool {
	return err != nil && strings.Contains(err.Error(), "was not provided by any .service files")
}

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

	if err == keyring.ErrUnsupportedPlatform || keyringNotConfigured(err) {
		boldGreen := color.New(color.FgGreen).Add(color.Bold)
		boldGreen.Printf("Warning: Fallback file keyring is being used")
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

	if err == keyring.ErrUnsupportedPlatform || keyringNotConfigured(err) {
		value, err = keyring.Get(currentVaultBackend, MAIN_KEYRING_SERVICE, key)
	}
	return value, err

}

func DeleteValueInKeyring(key string) error {
	currentVaultBackend, err := GetCurrentVaultBackend()
	if err != nil {
		return err
	}

	err = keyring.Delete(currentVaultBackend, MAIN_KEYRING_SERVICE, key)

	if err == keyring.ErrUnsupportedPlatform || keyringNotConfigured(err) {
		err = keyring.Delete(currentVaultBackend, MAIN_KEYRING_SERVICE, key)
	}

	return err
}
