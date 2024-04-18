package util

import (
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
		PrintErrorAndExit(1, err, "Unable to get current vault. Tip: run [infisical reset] then try again")
	}

	return keyring.Set(currentVaultBackend, MAIN_KEYRING_SERVICE, key, value)
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
