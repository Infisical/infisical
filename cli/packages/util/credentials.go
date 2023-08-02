package util

import (
	"encoding/json"
	"fmt"

	keyring "github.com/Infisical/infisical-merge/internal"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/go-resty/resty/v2"
	"github.com/rs/zerolog/log"
)

type LoggedInUserDetails struct {
	IsUserLoggedIn  bool
	LoginExpired    bool
	UserCredentials models.UserCredentials
}

func StoreUserCredsInKeyRing(userCred *models.UserCredentials) error {
	userCredMarshalled, err := json.Marshal(userCred)
	if err != nil {
		return fmt.Errorf("StoreUserCredsInKeyRing: something went wrong when marshalling user creds [err=%s]", err)
	}

	err = keyring.Set(userCred.Email, string(userCredMarshalled))
	if err != nil {
		return fmt.Errorf("StoreUserCredsInKeyRing: unable to store user credentials because [err=%s]", err)
	}

	return err
}

func GetUserCredsFromKeyRing(userEmail string) (credentials models.UserCredentials, err error) {
	credentialsValue, err := keyring.Get(userEmail)
	if err != nil {
		return models.UserCredentials{}, fmt.Errorf("GetUserCredsFromKeyRing: Unable to get key from Keyring. Could not find login credentials in your Keyring [err=%v]", err)
	}

	var userCredentials models.UserCredentials

	err = json.Unmarshal([]byte(credentialsValue), &userCredentials)
	if err != nil {
		return models.UserCredentials{}, fmt.Errorf("getUserCredsFromKeyRing: Something went wrong when unmarshalling user creds [err=%s]", err)
	}

	if err != nil {
		return models.UserCredentials{}, fmt.Errorf("GetUserCredsFromKeyRing: Unable to store user credentials [err=%s]", err)
	}

	return userCredentials, err
}

func GetCurrentLoggedInUserDetails() (LoggedInUserDetails, error) {
	if ConfigFileExists() {
		configFile, err := GetConfigFile()
		if err != nil {
			return LoggedInUserDetails{}, fmt.Errorf("getCurrentLoggedInUserDetails: unable to get logged in user from config file [err=%s]", err)
		}

		if configFile.LoggedInUserEmail == "" {
			return LoggedInUserDetails{}, nil
		}

		userCreds, err := GetUserCredsFromKeyRing(configFile.LoggedInUserEmail)
		if err != nil {
			return LoggedInUserDetails{}, fmt.Errorf("getCurrentLoggedInUserDetails: unable to your credentials from Keyring [err=%s]", err)
		}

		// check to to see if the JWT is still valid
		httpClient := resty.New().
			SetAuthToken(userCreds.JTWToken).
			SetHeader("Accept", "application/json")

		config.INFISICAL_URL_MANUAL_OVERRIDE = config.INFISICAL_URL
		//configFile.LoggedInUserDomain
		//if not empty set as infisical url
		if configFile.LoggedInUserDomain != "" {
			config.INFISICAL_URL = configFile.LoggedInUserDomain
		}

		isAuthenticated := api.CallIsAuthenticated(httpClient)

		// TODO
		// No cookie is set when user logins via browser
		if !isAuthenticated {
			accessTokenResponse, err := api.CallGetNewAccessTokenWithRefreshToken(httpClient, userCreds.RefreshToken)
			if err == nil && accessTokenResponse.Token != "" {
				isAuthenticated = true
				userCreds.JTWToken = accessTokenResponse.Token
			}
		}

		err = StoreUserCredsInKeyRing(&userCreds)
		if err != nil {
			log.Debug().Msg("unable to store your user credentials with new access token")
		}

		if !isAuthenticated {
			return LoggedInUserDetails{
				IsUserLoggedIn:  true, // was logged in
				LoginExpired:    true,
				UserCredentials: userCreds,
			}, nil
		}

		return LoggedInUserDetails{
			IsUserLoggedIn:  true,
			LoginExpired:    false,
			UserCredentials: userCreds,
		}, nil
	} else {
		return LoggedInUserDetails{}, nil
	}
}
