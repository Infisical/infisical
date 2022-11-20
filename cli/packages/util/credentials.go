package util

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/go-resty/resty/v2"
	log "github.com/sirupsen/logrus"
	"github.com/zalando/go-keyring"
)

const SERVICE_NAME = "infisical"

// To do: what happens if the user doesn't have a keyring in their system?
func StoreUserCredsInKeyRing(userCred *models.UserCredentials) error {
	userCredMarshalled, err := json.Marshal(userCred)
	if err != nil {
		return fmt.Errorf("Something went wrong when marshalling user creds:", err)
	}

	err = keyring.Set(SERVICE_NAME, userCred.Email, string(userCredMarshalled))
	if err != nil {
		return fmt.Errorf("Unable to store user credentials:", err)
	}

	return err
}

func GetUserCredsFromKeyRing(userEmail string) (credentials models.UserCredentials, err error) {
	credentialsString, err := keyring.Get(SERVICE_NAME, userEmail)
	if err != nil {
		return models.UserCredentials{}, fmt.Errorf("Unable to get key from Keyring:", err)
	}

	var userCredentials models.UserCredentials

	err = json.Unmarshal([]byte(credentialsString), &userCredentials)
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
		fullConfigFilePath, _, err := GetFullConfigFilePath()
		if err != nil {
			log.Debugln("Error gettting full path:", err)
			return false, "", err
		}

		configFileAsBytes, err := os.ReadFile(fullConfigFilePath)
		if err != nil {
			log.Debugln("Unable to read config file:", err)
			return false, "", err
		}

		var configFile models.ConfigFile
		err = json.Unmarshal(configFileAsBytes, &configFile)
		if err != nil {
			log.Debugln("Unable to unmarshal config file:", err)
			return false, "", err
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
