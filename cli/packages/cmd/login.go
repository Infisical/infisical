/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"encoding/base64"
	"encoding/hex"
	"strings"

	"errors"
	"fmt"
	"regexp"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/crypto"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/srp"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/fatih/color"
	"github.com/go-resty/resty/v2"
	"github.com/manifoldco/promptui"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
	"golang.org/x/crypto/argon2"
)

type params struct {
	memory      uint32
	iterations  uint32
	parallelism uint8
	saltLength  uint32
	keyLength   uint32
}

// loginCmd represents the login command
var loginCmd = &cobra.Command{
	Use:                   "login",
	Short:                 "Login into your Infisical account",
	DisableFlagsInUseLine: true,
	PreRun:                toggleDebug,
	Run: func(cmd *cobra.Command, args []string) {
		currentLoggedInUserDetails, err := util.GetCurrentLoggedInUserDetails()
		// if the key can't be found or there is an error getting current credentials from key ring, allow them to override
		if err != nil && (strings.Contains(err.Error(), "The specified item could not be found in the keyring") || strings.Contains(err.Error(), "unable to get key from Keyring") || strings.Contains(err.Error(), "GetUserCredsFromKeyRing")) {
			log.Debug(err)
		} else if err != nil {
			util.HandleError(err)
		}

		addUser := false
		if currentLoggedInUserDetails.UserCredentials.Email != "" {
			addUser, err = addNewUserPrompt()
			if err != nil {
				util.HandleError(err)
			}
		}

		if !addUser {
			if currentLoggedInUserDetails.IsUserLoggedIn && !currentLoggedInUserDetails.LoginExpired && len(currentLoggedInUserDetails.UserCredentials.PrivateKey) != 0 {
				shouldOverride, err := shouldOverrideLoginPrompt(currentLoggedInUserDetails.UserCredentials.Email)
				if err != nil {
					util.HandleError(err)
				}

				if !shouldOverride {
					return
				}
			}
		}

		email, password, err := askForLoginCredentials()
		if err != nil {
			util.HandleError(err, "Unable to parse email and password for authentication")
		}

		loginOneResponse, loginTwoResponse, err := getFreshUserCredentials(email, password)
		if err != nil {
			log.Infoln("Unable to authenticate with the provided credentials, please try again")
			log.Debugln(err)
			return
		}

		if loginTwoResponse.MfaEnabled {
			i := 1
			for i < 6 {
				mfaVerifyCode := askForMFACode()

				httpClient := resty.New()
				httpClient.SetAuthToken(loginTwoResponse.Token)
				verifyMFAresponse, mfaErrorResponse, requestError := api.CallVerifyMfaToken(httpClient, api.VerifyMfaTokenRequest{
					Email:    email,
					MFAToken: mfaVerifyCode,
				})

				if requestError != nil {
					util.HandleError(err)
					break
				} else if mfaErrorResponse != nil {
					if mfaErrorResponse.Context.Code == "mfa_invalid" {
						msg := fmt.Sprintf("Incorrect, verification code. You have %v attempts left", 5-i)
						fmt.Println(msg)
						if i == 5 {
							util.PrintErrorMessageAndExit("No tries left, please try again in a bit")
							break
						}
					}

					if mfaErrorResponse.Context.Code == "mfa_expired" {
						util.PrintErrorMessageAndExit("Your 2FA verification code has expired, please try logging in again")
						break
					}
					i++
				} else {
					loginTwoResponse.EncryptedPrivateKey = verifyMFAresponse.EncryptedPrivateKey
					loginTwoResponse.EncryptionVersion = verifyMFAresponse.EncryptionVersion
					loginTwoResponse.Iv = verifyMFAresponse.Iv
					loginTwoResponse.ProtectedKey = verifyMFAresponse.ProtectedKey
					loginTwoResponse.ProtectedKeyIV = verifyMFAresponse.ProtectedKeyIV
					loginTwoResponse.ProtectedKeyTag = verifyMFAresponse.ProtectedKeyTag
					loginTwoResponse.PublicKey = verifyMFAresponse.PublicKey
					loginTwoResponse.Tag = verifyMFAresponse.Tag
					loginTwoResponse.Token = verifyMFAresponse.Token
					loginTwoResponse.EncryptionVersion = verifyMFAresponse.EncryptionVersion

					break
				}
			}
		}

		var decryptedPrivateKey []byte

		if loginTwoResponse.EncryptionVersion == 1 {
			log.Debug("Login version 1")
			encryptedPrivateKey, _ := base64.StdEncoding.DecodeString(loginTwoResponse.EncryptedPrivateKey)
			tag, err := base64.StdEncoding.DecodeString(loginTwoResponse.Tag)
			if err != nil {
				util.HandleError(err)
			}

			IV, err := base64.StdEncoding.DecodeString(loginTwoResponse.Iv)
			if err != nil {
				util.HandleError(err)
			}

			paddedPassword := fmt.Sprintf("%032s", password)
			key := []byte(paddedPassword)

			computedDecryptedPrivateKey, err := crypto.DecryptSymmetric(key, encryptedPrivateKey, tag, IV)
			if err != nil || len(computedDecryptedPrivateKey) == 0 {
				util.HandleError(err)
			}

			decryptedPrivateKey = computedDecryptedPrivateKey

		} else if loginTwoResponse.EncryptionVersion == 2 {
			log.Debug("Login version 2")
			protectedKey, err := base64.StdEncoding.DecodeString(loginTwoResponse.ProtectedKey)
			if err != nil {
				util.HandleError(err)
			}

			protectedKeyTag, err := base64.StdEncoding.DecodeString(loginTwoResponse.ProtectedKeyTag)
			if err != nil {
				util.HandleError(err)
			}

			protectedKeyIV, err := base64.StdEncoding.DecodeString(loginTwoResponse.ProtectedKeyIV)
			if err != nil {
				util.HandleError(err)
			}

			nonProtectedTag, err := base64.StdEncoding.DecodeString(loginTwoResponse.Tag)
			if err != nil {
				util.HandleError(err)
			}

			nonProtectedIv, err := base64.StdEncoding.DecodeString(loginTwoResponse.Iv)
			if err != nil {
				util.HandleError(err)
			}

			parameters := &params{
				memory:      64 * 1024,
				iterations:  3,
				parallelism: 1,
				keyLength:   32,
			}

			derivedKey, err := generateFromPassword(password, []byte(loginOneResponse.Salt), parameters)
			if err != nil {
				util.HandleError(fmt.Errorf("unable to generate argon hash from password [err=%s]", err))
			}

			decryptedProtectedKey, err := crypto.DecryptSymmetric(derivedKey, protectedKey, protectedKeyTag, protectedKeyIV)
			if err != nil {
				util.HandleError(fmt.Errorf("unable to get decrypted protected key [err=%s]", err))
			}

			encryptedPrivateKey, err := base64.StdEncoding.DecodeString(loginTwoResponse.EncryptedPrivateKey)
			if err != nil {
				util.HandleError(err)
			}

			decryptedProtectedKeyInHex, err := hex.DecodeString(string(decryptedProtectedKey))
			if err != nil {
				util.HandleError(err)
			}

			computedDecryptedPrivateKey, err := crypto.DecryptSymmetric(decryptedProtectedKeyInHex, encryptedPrivateKey, nonProtectedTag, nonProtectedIv)
			if err != nil {
				util.HandleError(err)
			}

			decryptedPrivateKey = computedDecryptedPrivateKey
		} else {
			util.PrintErrorMessageAndExit("Insufficient details to decrypt private key")
		}

		if string(decryptedPrivateKey) == "" || email == "" || loginTwoResponse.Token == "" {
			log.Debugf("[decryptedPrivateKey=%s] [email=%s] [loginTwoResponse.Token=%s]", string(decryptedPrivateKey), email, loginTwoResponse.Token)
			util.PrintErrorMessageAndExit("We were unable to fetch required details to complete your login. Run with -d to see more info")
		}

		userCredentialsToBeStored := &models.UserCredentials{
			Email:      email,
			PrivateKey: string(decryptedPrivateKey),
			JTWToken:   loginTwoResponse.Token,
		}

		err = util.StoreUserCredsInKeyRing(userCredentialsToBeStored)
		if err != nil {
			currentVault, _ := util.GetCurrentVaultBackend()
			log.Errorf("Unable to store your credentials in system vault [%s]. Rerun with flag -d to see full logs", currentVault)
			log.Errorln("To trouble shoot further, read https://infisical.com/docs/cli/faq")
			log.Debugln(err)
			return
		}

		err = util.WriteInitalConfig(userCredentialsToBeStored)
		if err != nil {
			util.HandleError(err, "Unable to write write to Infisical Config file. Please try again")
		}

		// clear backed up secrets from prev account
		util.DeleteBackupSecrets()

		whilte := color.New(color.FgGreen)
		boldWhite := whilte.Add(color.Bold)
		boldWhite.Printf(">>>> Welcome to Infisical!")
		boldWhite.Printf(" You are now logged in as %v <<<< \n", email)

		plainBold := color.New(color.Bold)

		plainBold.Println("\nQuick links")
		fmt.Println("- Learn to inject secrets into your application at https://infisical.com/docs/cli/usage")
		fmt.Println("- Stuck? Join our slack for quick support https://infisical.com/slack")
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

func getFreshUserCredentials(email string, password string) (*api.GetLoginOneV2Response, *api.GetLoginTwoV2Response, error) {
	log.Debugln("getFreshUserCredentials:", "email", email, "password", password)
	httpClient := resty.New()
	httpClient.SetRetryCount(5)

	params := srp.GetParams(4096)
	secret1 := srp.GenKey()
	srpClient := srp.NewClient(params, []byte(email), []byte(password), secret1)
	srpA := hex.EncodeToString(srpClient.ComputeA())

	// ** Login one
	loginOneResponseResult, err := api.CallLogin1V2(httpClient, api.GetLoginOneV2Request{
		Email:           email,
		ClientPublicKey: srpA,
	})

	if err != nil {
		util.HandleError(err)
	}

	// **** Login 2
	serverPublicKey_bytearray, err := hex.DecodeString(loginOneResponseResult.ServerPublicKey)
	if err != nil {
		return nil, nil, err
	}

	userSalt, err := hex.DecodeString(loginOneResponseResult.Salt)
	if err != nil {
		return nil, nil, err
	}

	srpClient.SetSalt(userSalt, []byte(email), []byte(password))
	srpClient.SetB(serverPublicKey_bytearray)

	srpM1 := srpClient.ComputeM1()

	loginTwoResponseResult, err := api.CallLogin2V2(httpClient, api.GetLoginTwoV2Request{
		Email:       email,
		ClientProof: hex.EncodeToString(srpM1),
	})

	if err != nil {
		util.HandleError(err)
	}

	return &loginOneResponseResult, &loginTwoResponseResult, nil
}

func addNewUserPrompt() (bool, error) {
	prompt := promptui.Select{
		Label: "Infisical detects previous logged in users. Would you like to add a new user? Select[Yes/No]",
		Items: []string{"No", "Yes"},
	}

	_, result, err := prompt.Run()
	if err != nil {
		return false, err
	}
	return result == "Yes", err
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

func generateFromPassword(password string, salt []byte, p *params) (hash []byte, err error) {
	hash = argon2.IDKey([]byte(password), salt, p.iterations, p.memory, p.parallelism, p.keyLength)
	return hash, nil
}

func askForMFACode() string {
	mfaCodePromptUI := promptui.Prompt{
		Label: "Enter the 2FA verification code sent to your email",
	}

	mfaVerifyCode, err := mfaCodePromptUI.Run()
	if err != nil {
		util.HandleError(err)
	}

	return mfaVerifyCode
}
