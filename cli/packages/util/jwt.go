package util

import (
	"fmt"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/go-resty/resty/v2"
	"github.com/rs/zerolog/log"
)

// RefreshJWTToken attempts to refresh an expired JWT token using the refresh token
func RefreshJWTToken(httpClient *resty.Client, refreshToken string) (string, error) {
	if refreshToken == "" {
		return "", fmt.Errorf("no refresh token available")
	}

	accessTokenResponse, err := api.CallGetNewAccessTokenWithRefreshToken(httpClient, refreshToken)
	if err != nil {
		return "", fmt.Errorf("failed to refresh token: %w", err)
	}

	if accessTokenResponse.Token == "" {
		return "", fmt.Errorf("received empty token from refresh attempt")
	}

	return accessTokenResponse.Token, nil
}

// IsTokenExpired checks if the given token is expired by validating with the server
func IsTokenExpired(httpClient *resty.Client) bool {
	return !api.CallIsAuthenticated(httpClient)
}

// HandleTokenRefresh handles the complete token refresh flow
func HandleTokenRefresh(userCreds *models.UserCredentials) error {
	httpClient := resty.New().
		SetAuthToken(userCreds.JWTToken).
		SetHeader("Accept", "application/json")

	if IsTokenExpired(httpClient) && userCreds.RefreshToken != "" {
		newToken, err := RefreshJWTToken(httpClient, userCreds.RefreshToken)
		if err != nil {
			return err
		}

		userCreds.JWTToken = newToken
		err = StoreUserCredsInKeyRing(userCreds)
		if err != nil {
			log.Debug().Msg("unable to store refreshed credentials in keyring")
			return err
		}
	}

	return nil
}