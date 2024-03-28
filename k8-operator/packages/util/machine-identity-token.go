package util

import (
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/Infisical/infisical/k8-operator/packages/api"
	"github.com/go-resty/resty/v2"
)

type MachineIdentityToken struct {
	accessTokenTTL           time.Duration
	accessTokenMaxTTL        time.Duration
	accessTokenFetchedTime   time.Time
	accessTokenRefreshedTime time.Time

	mutex sync.Mutex

	accessToken  string
	clientSecret string
	clientId     string
}

func NewMachineIdentityToken(clientId string, clientSecret string) *MachineIdentityToken {

	token := MachineIdentityToken{
		clientSecret: clientSecret,
		clientId:     clientId,
	}

	go token.HandleTokenLifecycle()

	return &token
}

func (t *MachineIdentityToken) HandleTokenLifecycle() error {

	for {
		accessTokenMaxTTLExpiresInTime := t.accessTokenFetchedTime.Add(t.accessTokenMaxTTL - (5 * time.Second))
		accessTokenRefreshedTime := t.accessTokenRefreshedTime

		if accessTokenRefreshedTime.IsZero() {
			accessTokenRefreshedTime = t.accessTokenFetchedTime
		}

		nextAccessTokenExpiresInTime := accessTokenRefreshedTime.Add(t.accessTokenTTL - (5 * time.Second))

		if t.accessTokenFetchedTime.IsZero() && t.accessTokenRefreshedTime.IsZero() {
			// case: init login to get access token
			fmt.Println("\nInfisical Authentication: attempting to authenticate...")
			err := t.FetchNewAccessToken()
			if err != nil {
				fmt.Printf("\nInfisical Authentication: unable to authenticate universal auth because %v. Will retry in 30 seconds", err)

				// wait a bit before trying again
				time.Sleep((30 * time.Second))
				continue
			}
		} else if time.Now().After(accessTokenMaxTTLExpiresInTime) {
			fmt.Printf("\nInfisical Authentication: machine identity access token has reached max ttl, attempting to re authenticate...")
			err := t.FetchNewAccessToken()
			if err != nil {
				fmt.Printf("\nInfisical Authentication: unable to authenticate universal auth because %v. Will retry in 30 seconds", err)

				// wait a bit before trying again
				time.Sleep((30 * time.Second))
				continue
			}
		} else {
			err := t.RefreshAccessToken()
			if err != nil {
				fmt.Printf("\nInfisical Authentication: unable to refresh universal auth token because %v. Will retry in 30 seconds", err)

				// wait a bit before trying again
				time.Sleep((30 * time.Second))
				continue
			}
		}

		if accessTokenRefreshedTime.IsZero() {
			accessTokenRefreshedTime = t.accessTokenFetchedTime
		} else {
			accessTokenRefreshedTime = t.accessTokenRefreshedTime
		}

		nextAccessTokenExpiresInTime = accessTokenRefreshedTime.Add(t.accessTokenTTL - (5 * time.Second))
		accessTokenMaxTTLExpiresInTime = t.accessTokenFetchedTime.Add(t.accessTokenMaxTTL - (5 * time.Second))

		if nextAccessTokenExpiresInTime.After(accessTokenMaxTTLExpiresInTime) {
			// case: Refreshed so close that the next refresh would occur beyond max ttl (this is because currently, token renew tries to add +access-token-ttl amount of time)
			// example: access token ttl is 11 sec and max ttl is 30 sec. So it will start with 11 seconds, then 22 seconds but the next time you call refresh it would try to extend it to 33 but max ttl only allows 30, so the token will be valid until 30 before we need to reauth
			time.Sleep(t.accessTokenTTL - nextAccessTokenExpiresInTime.Sub(accessTokenMaxTTLExpiresInTime))
		} else {
			time.Sleep(t.accessTokenTTL - (5 * time.Second))
		}
	}
}

func (t *MachineIdentityToken) RefreshAccessToken() error {
	httpClient := resty.New()
	httpClient.SetRetryCount(10000).
		SetRetryMaxWaitTime(20 * time.Second).
		SetRetryWaitTime(5 * time.Second)

	accessToken, err := t.GetToken()

	if err != nil {
		return err
	}

	response, err := api.CallUniversalMachineIdentityRefreshAccessToken(api.MachineIdentityUniversalAuthRefreshRequest{AccessToken: accessToken})
	if err != nil {
		return err
	}

	accessTokenTTL := time.Duration(response.ExpiresIn * int(time.Second))
	accessTokenMaxTTL := time.Duration(response.AccessTokenMaxTTL * int(time.Second))
	t.accessTokenRefreshedTime = time.Now()

	t.SetToken(response.AccessToken, accessTokenTTL, accessTokenMaxTTL)

	return nil
}

// Fetches a new access token using client credentials
func (t *MachineIdentityToken) FetchNewAccessToken() error {

	loginResponse, err := api.CallUniversalMachineIdentityLogin(api.MachineIdentityUniversalAuthLoginRequest{
		ClientId:     t.clientId,
		ClientSecret: t.clientSecret,
	})
	if err != nil {
		return err
	}

	accessTokenTTL := time.Duration(loginResponse.ExpiresIn * int(time.Second))
	accessTokenMaxTTL := time.Duration(loginResponse.AccessTokenMaxTTL * int(time.Second))

	if accessTokenTTL <= time.Duration(5)*time.Second {
		fmt.Println("\nInfisical Authentication: At this time, k8 operator does not support refresh of tokens with 5 seconds or less ttl. Please increase access token ttl and try again")
		os.Exit(1)
	}

	t.accessTokenFetchedTime = time.Now()
	t.SetToken(loginResponse.AccessToken, accessTokenTTL, accessTokenMaxTTL)

	return nil
}

func (t *MachineIdentityToken) SetToken(token string, accessTokenTTL time.Duration, accessTokenMaxTTL time.Duration) {
	t.mutex.Lock()
	defer t.mutex.Unlock()

	t.accessToken = token
	t.accessTokenTTL = accessTokenTTL
	t.accessTokenMaxTTL = accessTokenMaxTTL
}

func (t *MachineIdentityToken) GetToken() (string, error) {
	t.mutex.Lock()
	defer t.mutex.Unlock()

	if t.accessToken == "" {
		return "", fmt.Errorf("no machine identity access token available")
	}

	return t.accessToken, nil
}
