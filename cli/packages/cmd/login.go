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
	"net/url"
	"regexp"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/crypto"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/srp"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/fatih/color"
	"github.com/go-resty/resty/v2"
	"github.com/manifoldco/promptui"
	"github.com/posthog/posthog-go"
	"github.com/rs/zerolog/log"
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

const ADD_USER = "Add a new account login"
const REPLACE_USER = "Override current logged in user"
const EXIT_USER_MENU = "Exit"

// loginCmd represents the login command
var loginCmd = &cobra.Command{
	Use:                   "login",
	Short:                 "Login into your Infisical account",
	DisableFlagsInUseLine: true,
	Run: func(cmd *cobra.Command, args []string) {
		currentLoggedInUserDetails, err := util.GetCurrentLoggedInUserDetails()
		// if the key can't be found or there is an error getting current credentials from key ring, allow them to override
		if err != nil && (strings.Contains(err.Error(), "The specified item could not be found in the keyring") || strings.Contains(err.Error(), "unable to get key from Keyring") || strings.Contains(err.Error(), "GetUserCredsFromKeyRing")) {
			log.Debug().Err(err)
		} else if err != nil {
			util.HandleError(err)
		}

		if currentLoggedInUserDetails.IsUserLoggedIn && !currentLoggedInUserDetails.LoginExpired && len(currentLoggedInUserDetails.UserCredentials.PrivateKey) != 0 {
			shouldOverride, err := userLoginMenu(currentLoggedInUserDetails.UserCredentials.Email)
			if err != nil {
				util.HandleError(err)
			}

			if !shouldOverride {
				return
			}
		}

		//override domain
		domainQuery := true
		if config.INFISICAL_URL_MANUAL_OVERRIDE != "" && config.INFISICAL_URL_MANUAL_OVERRIDE != util.INFISICAL_DEFAULT_API_URL {
			overrideDomain, err := DomainOverridePrompt()
			if err != nil {
				util.HandleError(err)
			}

			//if not override set INFISICAL_URL to exported var
			//set domainQuery to false
			if !overrideDomain {
				domainQuery = false
				config.INFISICAL_URL = config.INFISICAL_URL_MANUAL_OVERRIDE
			}

		}

		//prompt user to select domain between Infisical cloud and self hosting
		if domainQuery {
			err = askForDomain()
			if err != nil {
				util.HandleError(err, "Unable to parse domain url")
			}
		}

		email, password, err := askForLoginCredentials()
		if err != nil {
			util.HandleError(err, "Unable to parse email and password for authentication")
		}

		loginOneResponse, loginTwoResponse, err := getFreshUserCredentials(email, password)
		if err != nil {
			fmt.Println("Unable to authenticate with the provided credentials, please try again")
			log.Debug().Err(err)
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
			log.Debug().Msg("Login version 1")
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
			log.Debug().Msg("Login version 2")
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
			log.Debug().Msgf("[decryptedPrivateKey=%s] [email=%s] [loginTwoResponse.Token=%s]", string(decryptedPrivateKey), email, loginTwoResponse.Token)
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
			log.Error().Msgf("Unable to store your credentials in system vault [%s]. Rerun with flag -d to see full logs", currentVault)
			log.Error().Msgf("\nTo trouble shoot further, read https://infisical.com/docs/cli/faq")
			log.Debug().Err(err)
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
		Telemetry.CaptureEvent("cli-command:login", posthog.NewProperties().Set("infisical-backend", config.INFISICAL_URL).Set("version", util.CLI_VERSION))
	},
}

func init() {
	rootCmd.AddCommand(loginCmd)
}

func DomainOverridePrompt() (bool, error) {
	const (
		PRESET   = "Use Domain"
		OVERRIDE = "Change Domain"
	)

	options := []string{PRESET, OVERRIDE}
	optionsPrompt := promptui.Select{
		Label: fmt.Sprintf("Current INFISICAL_API_URL Domain Override: %s", config.INFISICAL_URL_MANUAL_OVERRIDE),
		Items: options,
		Size:  2,
	}

	_, selectedOption, err := optionsPrompt.Run()
	if err != nil {
		return false, err
	}

	return selectedOption == OVERRIDE, err
}

func askForDomain() error {
	//query user to choose between Infisical cloud or self hosting
	const (
		INFISICAL_CLOUD = "Infisical Cloud"
		SELF_HOSTING    = "Self Hosting"
	)

	options := []string{INFISICAL_CLOUD, SELF_HOSTING}
	optionsPrompt := promptui.Select{
		Label: "Select your hosting option",
		Items: options,
		Size:  2,
	}

	_, selectedHostingOption, err := optionsPrompt.Run()
	if err != nil {
		return err
	}

	if selectedHostingOption == INFISICAL_CLOUD {
		//cloud option
		config.INFISICAL_URL = util.INFISICAL_DEFAULT_API_URL
		return nil
	}

	urlValidation := func(input string) error {
		_, err := url.ParseRequestURI(input)
		if err != nil {
			return errors.New("this is an invalid url")
		}
		return nil
	}

	domainPrompt := promptui.Prompt{
		Label:    "Domain",
		Validate: urlValidation,
		Default:  "Example - https://my-self-hosted-instance.com/api",
	}

	domain, err := domainPrompt.Run()
	if err != nil {
		return err
	}

	//set api url
	config.INFISICAL_URL = domain
	//return nil
	return nil
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
	log.Debug().Msg(fmt.Sprint("getFreshUserCredentials: ", "email", email, "password: ", password))
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

func userLoginMenu(currentLoggedInUserEmail string) (bool, error) {
	label := fmt.Sprintf("Current logged in user email: %s on domain: %s", currentLoggedInUserEmail, config.INFISICAL_URL)

	prompt := promptui.Select{
		Label: label,
		Items: []string{ADD_USER, REPLACE_USER, EXIT_USER_MENU},
	}
	_, result, err := prompt.Run()
	if err != nil {
		return false, err
	}
	return result != EXIT_USER_MENU, err
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
