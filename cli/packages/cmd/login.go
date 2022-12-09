/*
Copyright © 2022 NAME HERE <EMAIL ADDRESS>
*/
package cmd

import (
	"encoding/base64"
	"encoding/hex"

	"errors"
	"fmt"
	"regexp"

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/srp"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/go-resty/resty/v2"
	"github.com/manifoldco/promptui"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

// loginCmd represents the login command
var loginCmd = &cobra.Command{
	Use:                   "login",
	Short:                 "Login into your Infisical account",
	DisableFlagsInUseLine: true,
	PreRun:                toggleDebug,
	Run: func(cmd *cobra.Command, args []string) {
		hasUserLoggedInbefore, currentLoggedInUserEmail, err := util.IsUserLoggedIn()

		if err != nil {
			log.Debugln("Unable to get current logged in user.", err)
		}

		if hasUserLoggedInbefore {
			shouldOverride, err := shouldOverrideLoginPrompt(currentLoggedInUserEmail)
			if err != nil {
				log.Errorln("Unable to parse your answer")
				log.Debug(err)
				return
			}

			if !shouldOverride {
				return
			}
		}

		email, password, err := askForLoginCredentials()
		if err != nil {
			log.Errorln("Unable to parse email and password for authentication")
			log.Debugln(err)
			return
		}

		userCredentials, err := getFreshUserCredentials(email, password)
		if err != nil {
			log.Errorln("Unable to authenticate with the provided credentials, please try again")
			log.Debugln(err)
			return
		}

		encryptedPrivateKey, _ := base64.StdEncoding.DecodeString(userCredentials.EncryptedPrivateKey)
		tag, err := base64.StdEncoding.DecodeString(userCredentials.Tag)
		if err != nil {
			log.Errorln("Unable to decode the auth tag")
			log.Debugln(err)
		}

		IV, err := base64.StdEncoding.DecodeString(userCredentials.IV)
		if err != nil {
			log.Errorln("Unable to decode the IV/Nonce")
			log.Debugln(err)
		}

		paddedPassword := fmt.Sprintf("%032s", password)
		key := []byte(paddedPassword)

		decryptedPrivateKey, err := util.DecryptSymmetric(key, encryptedPrivateKey, tag, IV)
		if err != nil || len(decryptedPrivateKey) == 0 {
			log.Errorln("There was an issue decrypting your keys")
			log.Debugln(err)
			return
		}

		userCredentialsToBeStored := &models.UserCredentials{
			Email:      email,
			PrivateKey: string(decryptedPrivateKey),
			JTWToken:   userCredentials.JTWToken,
		}

		err = util.StoreUserCredsInKeyRing(userCredentialsToBeStored)
		if err != nil {
			log.Errorln("Unable to store your credentials in system key ring")
			log.Debugln(err)
			return
		}

		err = util.WriteInitalConfig(userCredentialsToBeStored)
		if err != nil {
			log.Errorln("Unable to write write to Infisical Config file. Please try again")
			log.Debugln(err)
			return
		}

		log.Infoln("Nice! You are loggin as:", email)

	},
}

func init() {
	rootCmd.AddCommand(loginCmd)
}

func askForLoginCredentials() (email string, password string, err error) {
	validateEmail := func(input string) error {
		matched, err := regexp.MatchString("^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$", input)
		if err != nil || !matched {
			return errors.New("this doesn't look like an email address")
		}
		return nil
	}

	emailPrompt := promptui.Prompt{
		Label:    "Email",
		Validate: validateEmail,
	}

	userEmail, err := emailPrompt.Run()

	if err != nil {
		return "", "", err
	}

	validatePassword := func(input string) error {
		if len(input) < 1 {
			return errors.New("please enter a valid password")
		}
		return nil
	}

	passwordPrompt := promptui.Prompt{
		Label:    "Password",
		Validate: validatePassword,
		Mask:     '*',
	}

	userPassword, err := passwordPrompt.Run()

	if err != nil {
		return "", "", err
	}

	return userEmail, userPassword, nil
}

func getFreshUserCredentials(email string, password string) (*models.LoginTwoResponse, error) {
	log.Debugln("getFreshUserCredentials:", "email", email, "password", password)
	httpClient := resty.New()
	httpClient.SetRetryCount(5)

	params := srp.GetParams(4096)
	secret1 := srp.GenKey()
	srpClient := srp.NewClient(params, []byte(email), []byte(password), secret1)
	srpA := hex.EncodeToString(srpClient.ComputeA())

	// ** Login one
	loginOneRequest := models.LoginOneRequest{
		Email:           email,
		ClientPublicKey: srpA,
	}

	var loginOneResponseResult models.LoginOneResponse

	loginOneResponse, err := httpClient.
		R().
		SetBody(loginOneRequest).
		SetResult(&loginOneResponseResult).
		Post(fmt.Sprintf("%v/v1/auth/login1", util.INFISICAL_URL))

	if err != nil {
		return nil, err
	}

	if loginOneResponse.StatusCode() > 299 {
		return nil, fmt.Errorf("ops, unsuccessful response code. [response=%v]", loginOneResponse)
	}

	// **** Login 2
	serverPublicKey_bytearray, err := hex.DecodeString(loginOneResponseResult.ServerPublicKey)
	if err != nil {
		return nil, err
	}

	userSalt, err := hex.DecodeString(loginOneResponseResult.ServerSalt)
	if err != nil {
		return nil, err
	}

	srpClient.SetSalt(userSalt, []byte(email), []byte(password))
	srpClient.SetB(serverPublicKey_bytearray)

	srpM1 := srpClient.ComputeM1()

	LoginTwoRequest := models.LoginTwoRequest{
		Email:       email,
		ClientProof: hex.EncodeToString(srpM1),
	}

	var loginTwoResponseResult models.LoginTwoResponse
	loginTwoResponse, err := httpClient.
		R().
		SetBody(LoginTwoRequest).
		SetResult(&loginTwoResponseResult).
		Post(fmt.Sprintf("%v/v1/auth/login2", util.INFISICAL_URL))

	if err != nil {
		return nil, err
	}

	if loginTwoResponse.StatusCode() > 299 {
		return nil, fmt.Errorf("ops, unsuccessful response code. [response=%v]", loginTwoResponse)
	}

	return &loginTwoResponseResult, nil
}

func shouldOverrideLoginPrompt(currentLoggedInUserEmail string) (bool, error) {
	prompt := promptui.Select{
		Label: fmt.Sprintf("There seems to be a user already logged in with the email: %s. Would you like to override that login? Select[Yes/No]", currentLoggedInUserEmail),
		Items: []string{"No", "Yes"},
	}
	_, result, err := prompt.Run()
	if err != nil {
		return false, err
	}
	return result == "Yes", err
}
