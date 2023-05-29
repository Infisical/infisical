package util

import (
	"fmt"
	"os"

	"github.com/99designs/keyring"
	"golang.org/x/term"
)

func GetCurrentVaultBackend() (keyring.BackendType, error) {
	configFile, err := GetConfigFile()
	if err != nil {
		return "", fmt.Errorf("getCurrentVaultBackend: unable to get config file [err=%s]", err)
	}

	if configFile.VaultBackendType == "" {
		return keyring.AvailableBackends()[0], nil
	}

	return configFile.VaultBackendType, nil
}

func GetKeyRing() (keyring.Keyring, error) {
	currentVaultBackend, err := GetCurrentVaultBackend()
	if err != nil {
		return nil, fmt.Errorf("GetKeyRing: unable to get the current vault backend, [err=%s]", err)
	}

	keyringInstanceConfig := keyring.Config{
		FilePasswordFunc:               fileKeyringPassphrasePrompt,
		ServiceName:                    KEYRING_SERVICE_NAME,
		LibSecretCollectionName:        KEYRING_SERVICE_NAME,
		KWalletAppID:                   KEYRING_SERVICE_NAME,
		KWalletFolder:                  KEYRING_SERVICE_NAME,
		KeychainName:                   "infisical", // default so user will not be prompted
		KeychainTrustApplication:       true,
		WinCredPrefix:                  KEYRING_SERVICE_NAME,
		FileDir:                        fmt.Sprintf("~/%s-file-vault", KEYRING_SERVICE_NAME),
		KeychainAccessibleWhenUnlocked: true,
	}

	// if the user explicitly sets a vault backend, then only use that
	if currentVaultBackend != "" {
		keyringInstanceConfig.AllowedBackends = []keyring.BackendType{keyring.BackendType(currentVaultBackend)}
	}

	keyringInstance, err := keyring.Open(keyringInstanceConfig)
	if err != nil {
		return nil, fmt.Errorf("GetKeyRing: Unable to create instance of Keyring because of [err=%s]", err)
	}

	return keyringInstance, nil
}

func fileKeyringPassphrasePrompt(prompt string) (string, error) {
	if password, ok := os.LookupEnv("VAULT_PASS"); ok {
		return password, nil
	} else if password, ok := os.LookupEnv("INFISICAL_VAULT_FILE_PASSPHRASE"); ok {
		return password, nil
	} else {
		fmt.Println("To avoid repeatedly typing your password, set the environment variable `VAULT_PASS` to your password")
	}

	fmt.Fprintf(os.Stderr, "%s:", prompt)
	b, err := term.ReadPassword(int(os.Stdin.Fd()))
	if err != nil {
		return "", err
	}

	fmt.Println("")
	return string(b), nil
}
