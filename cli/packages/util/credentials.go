package util

import (
	"encoding/json"
	"fmt"

	"github.com/99designs/keyring"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/go-resty/resty/v2"
	log "github.com/sirupsen/logrus"
)

const SERVICE_NAME = "infisical"

// To do: what happens if the user doesn't have a keyring in their system?
func StoreUserCredsInKeyRing(userCred *models.UserCredentials) error {
	userCredMarshalled, err := json.Marshal(userCred)
	if err != nil {
		return fmt.Errorf("StoreUserCredsInKeyRing: something went wrong when marshalling user creds [err=%s]", err)
	}

	err = keyringInstance.Set(keyring.Item{
		Key:  userCred.Email,
		Data: []byte(string(userCredMarshalled)),
	})

	if err != nil {
		return fmt.Errorf("StoreUserCredsInKeyRing: unable to store user credentials because [err=%s]", err)
	}

	return err
}

func GetUserCredsFromKeyRing(userEmail string) (credentials models.UserCredentials, err error) {
	credentialsValue, err := keyringInstance.Get(userEmail)
	if err != nil {
		return models.UserCredentials{}, fmt.Errorf("Unable to get key from Keyring. could not find login credentials in your Keyring. This is common if you have switched vault backend recently. If so, please login in again and retry:", err)
	}

	var userCredentials models.UserCredentials

	err = json.Unmarshal([]byte(credentialsValue.Data), &userCredentials)
	if err != nil {
		return models.UserCredentials{}, fmt.Errorf("Something went wrong when unmarshalling user creds:", err)
	}

	if err != nil {
		return models.UserCredentials{}, fmt.Errorf("Unable to store user credentials", err)
	}

	return userCredentials, err
}

func IsUserLoggedIn() (hasUserLoggedIn bool, theUsersEmail string, err error) {
	if ConfigFileExists() {
		configFile, err := GetConfigFile()
		if err != nil {
			return false, "", fmt.Errorf("IsUserLoggedIn: unable to get logged in user from config file [err=%s]", err)
		}

		if configFile.LoggedInUserEmail == "" {
			return false, "", nil
		}

		userCreds, err := GetUserCredsFromKeyRing(configFile.LoggedInUserEmail)
		if err != nil {
			return false, "", err
		}

		// check to to see if the JWT is still valid
		httpClient := resty.New().
			SetAuthToken(userCreds.JTWToken).
			SetHeader("Accept", "application/json")

		response, err := httpClient.
			R().
			Post(fmt.Sprintf("%v/v1/auth/checkAuth", INFISICAL_URL))

		if err != nil {
			return false, "", err
		}

		if response.StatusCode() > 299 {
			log.Infoln("Login expired, please login again.")
			return false, "", fmt.Errorf("Login expired, please login again.")
		}

		return true, configFile.LoggedInUserEmail, nil
	} else {
		return false, "", nil
	}
}
