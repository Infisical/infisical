/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"runtime"
	"slices"
	"strings"
	"time"

	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"regexp"

	browser "github.com/pkg/browser"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/Infisical/infisical-merge/packages/crypto"
	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/srp"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/fatih/color"
	"github.com/manifoldco/promptui"
	"github.com/posthog/posthog-go"
	"github.com/rs/cors"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"golang.org/x/crypto/argon2"
	"golang.org/x/term"

	infisicalSdk "github.com/infisical/go-sdk"
)

type params struct {
	memory      uint32
	iterations  uint32
	parallelism uint8
	saltLength  uint32
	keyLength   uint32
}

func formatAuthMethod(authMethod string) string {
	return strings.ReplaceAll(authMethod, "-", " ")
}

const ADD_USER = "Add a new account login"
const REPLACE_USER = "Override current logged in user"
const EXIT_USER_MENU = "Exit"
const QUIT_BROWSER_LOGIN = "q"

// loginCmd represents the login command
var loginCmd = &cobra.Command{
	Use:                   "login",
	Short:                 "Login into your Infisical account",
	DisableFlagsInUseLine: true,
	PreRunE: func(cmd *cobra.Command, args []string) error {
		// daniel: oidc-jwt is deprecated in favor of `jwt`. we backfill the `jwt` flag with the value of `oidc-jwt` if it's set.
		if cmd.Flags().Changed("oidc-jwt") && !cmd.Flags().Changed("jwt") {
			oidcJWT, err := cmd.Flags().GetString("oidc-jwt")
			if err != nil {
				return err
			}

			err = cmd.Flags().Set("jwt", oidcJWT)
			if err != nil {
				return err
			}
		}
		return nil
	},
	Run: func(cmd *cobra.Command, args []string) {
		presetDomain := config.INFISICAL_URL

		clearSelfHostedDomains, err := cmd.Flags().GetBool("clear-domains")
		if err != nil {
			util.HandleError(err)
		}

		if clearSelfHostedDomains {
			infisicalConfig, err := util.GetConfigFile()
			if err != nil {
				util.HandleError(err)
			}

			infisicalConfig.Domains = []string{}
			err = util.WriteConfigFile(&infisicalConfig)

			if err != nil {
				util.HandleError(err)
			}

			fmt.Println("Cleared all self-hosted domains from the config file")
			return
		}

		customHeaders, err := util.GetInfisicalCustomHeadersMap()
		if err != nil {
			util.HandleError(err, "Unable to get custom headers")
		}

		infisicalClient := infisicalSdk.NewInfisicalClient(context.Background(), infisicalSdk.Config{
			SiteUrl:          config.INFISICAL_URL,
			UserAgent:        api.USER_AGENT,
			AutoTokenRefresh: false,
			CustomHeaders:    customHeaders,
		})

		loginMethod, err := cmd.Flags().GetString("method")
		if err != nil {
			util.HandleError(err)
		}
		plainOutput, err := cmd.Flags().GetBool("plain")
		if err != nil {
			util.HandleError(err)
		}

		authMethodValid, strategy := util.IsAuthMethodValid(loginMethod, true)
		if !authMethodValid {
			util.PrintErrorMessageAndExit(fmt.Sprintf("Invalid login method: %s", loginMethod))
		}

		// standalone user auth
		if loginMethod == "user" {
			currentLoggedInUserDetails, err := util.GetCurrentLoggedInUserDetails(true)
			// if the key can't be found or there is an error getting current credentials from key ring, allow them to override
			if err != nil && (strings.Contains(err.Error(), "we couldn't find your logged in details")) {
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

			usePresetDomain, err := usePresetDomain(presetDomain)

			if err != nil {
				util.HandleError(err)
			}

			//override domain
			domainQuery := true
			if config.INFISICAL_URL_MANUAL_OVERRIDE != "" &&
				config.INFISICAL_URL_MANUAL_OVERRIDE != fmt.Sprintf("%s/api", util.INFISICAL_DEFAULT_EU_URL) &&
				config.INFISICAL_URL_MANUAL_OVERRIDE != fmt.Sprintf("%s/api", util.INFISICAL_DEFAULT_US_URL) &&
				!usePresetDomain {
				overrideDomain, err := DomainOverridePrompt()
				if err != nil {
					util.HandleError(err)
				}

				//if not override set INFISICAL_URL to exported var
				//set domainQuery to false
				if !overrideDomain && !usePresetDomain {
					domainQuery = false
					config.INFISICAL_URL = util.AppendAPIEndpoint(config.INFISICAL_URL_MANUAL_OVERRIDE)
					config.INFISICAL_LOGIN_URL = fmt.Sprintf("%s/login", strings.TrimSuffix(config.INFISICAL_URL, "/api"))
				}

			}

			//prompt user to select domain between Infisical cloud and self-hosting
			if domainQuery && !usePresetDomain {
				err = askForDomain()
				if err != nil {
					util.HandleError(err, "Unable to parse domain url")
				}
			}
			var userCredentialsToBeStored models.UserCredentials

			interactiveLogin := false
			if cmd.Flags().Changed("interactive") {
				interactiveLogin = true
				cliDefaultLogin(&userCredentialsToBeStored)
			}

			//call browser login function
			if !interactiveLogin {
				userCredentialsToBeStored, err = browserCliLogin()
				if err != nil {
					fmt.Printf("Login via browser failed. %s", err.Error())
					//default to cli login on error
					cliDefaultLogin(&userCredentialsToBeStored)
				}
			}

			err = util.StoreUserCredsInKeyRing(&userCredentialsToBeStored)
			if err != nil {
				log.Error().Msgf("Unable to store your credentials in system vault")
				log.Error().Msgf("\nTo trouble shoot further, read https://infisical.com/docs/cli/faq")
				log.Debug().Err(err)
				//return here
				util.HandleError(err)
			}

			err = util.WriteInitalConfig(&userCredentialsToBeStored)
			if err != nil {
				util.HandleError(err, "Unable to write write to Infisical Config file. Please try again")
			}

			// clear backed up secrets from prev account
			util.DeleteBackupSecrets()

			whilte := color.New(color.FgGreen)
			boldWhite := whilte.Add(color.Bold)
			time.Sleep(time.Second * 1)
			boldWhite.Printf(">>>> Welcome to Infisical!")
			boldWhite.Printf(" You are now logged in as %v <<<< \n", userCredentialsToBeStored.Email)

			plainBold := color.New(color.Bold)

			plainBold.Println("\nQuick links")
			fmt.Println("- Learn to inject secrets into your application at https://infisical.com/docs/cli/usage")
			fmt.Println("- Stuck? Join our slack for quick support https://infisical.com/slack")
			Telemetry.CaptureEvent("cli-command:login", posthog.NewProperties().Set("infisical-backend", config.INFISICAL_URL).Set("version", util.CLI_VERSION))
		} else {

			sdkAuthenticator := util.NewSdkAuthenticator(infisicalClient, cmd)

			authStrategies := map[util.AuthStrategyType]func() (credential infisicalSdk.MachineIdentityCredential, e error){
				util.AuthStrategy.UNIVERSAL_AUTH:    sdkAuthenticator.HandleUniversalAuthLogin,
				util.AuthStrategy.KUBERNETES_AUTH:   sdkAuthenticator.HandleKubernetesAuthLogin,
				util.AuthStrategy.AZURE_AUTH:        sdkAuthenticator.HandleAzureAuthLogin,
				util.AuthStrategy.GCP_ID_TOKEN_AUTH: sdkAuthenticator.HandleGcpIdTokenAuthLogin,
				util.AuthStrategy.GCP_IAM_AUTH:      sdkAuthenticator.HandleGcpIamAuthLogin,
				util.AuthStrategy.AWS_IAM_AUTH:      sdkAuthenticator.HandleAwsIamAuthLogin,
				util.AuthStrategy.OIDC_AUTH:         sdkAuthenticator.HandleOidcAuthLogin,
				util.AuthStrategy.JWT_AUTH:          sdkAuthenticator.HandleJwtAuthLogin,
			}

			credential, err := authStrategies[strategy]()

			if err != nil {
				euErrorMessage := ""
				if strings.HasPrefix(config.INFISICAL_URL, util.INFISICAL_DEFAULT_US_URL) {
					euErrorMessage = fmt.Sprintf("\nIf you are using the Infisical Cloud Europe Region, please switch to it by using the \"--domain %s\" flag.", util.INFISICAL_DEFAULT_EU_URL)
				}
				util.HandleError(fmt.Errorf("unable to authenticate with %s [err=%v].%s", formatAuthMethod(loginMethod), err, euErrorMessage))
			}

			if plainOutput {
				fmt.Println(credential.AccessToken)
				return
			}

			boldGreen := color.New(color.FgGreen).Add(color.Bold)
			boldPlain := color.New(color.Bold)
			time.Sleep(time.Second * 1)
			boldGreen.Printf(">>>> Successfully authenticated with %s!\n\n", formatAuthMethod(loginMethod))
			boldPlain.Printf("Access Token:\n%v", credential.AccessToken)

			plainBold := color.New(color.Bold)
			plainBold.Println("\n\nYou can use this access token to authenticate through other commands in the CLI.")

		}
	},
}

func cliDefaultLogin(userCredentialsToBeStored *models.UserCredentials) {
	email, password, err := askForLoginCredentials()
	if err != nil {
		util.HandleError(err, "Unable to parse email and password for authentication")
	}

	loginOneResponse, loginTwoResponse, err := getFreshUserCredentials(email, password)
	if err != nil {
		fmt.Println("Unable to authenticate with the provided credentials, please try again")
		log.Debug().Err(err)
		//return here
		util.HandleError(err)
	}

	if loginTwoResponse.MfaEnabled {
		i := 1
		for i < 6 {
			mfaVerifyCode := askForMFACode("email")

			httpClient, err := util.GetRestyClientWithCustomHeaders()
			if err != nil {
				util.HandleError(err, "Unable to get resty client with custom headers")
			}
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
	// Login is successful so ask user to choose organization
	newJwtToken := GetJwtTokenWithOrganizationId(loginTwoResponse.Token, email)

	//updating usercredentials
	userCredentialsToBeStored.Email = email
	userCredentialsToBeStored.PrivateKey = string(decryptedPrivateKey)
	userCredentialsToBeStored.JTWToken = newJwtToken
}

func init() {
	rootCmd.AddCommand(loginCmd)
	loginCmd.Flags().Bool("clear-domains", false, "clear all self-hosting domains from the config file")
	loginCmd.Flags().BoolP("interactive", "i", false, "login via the command line")
	loginCmd.Flags().Bool("plain", false, "only output the token without any formatting")
	loginCmd.Flags().String("method", "user", "login method [user, universal-auth, kubernetes, azure, gcp-id-token, gcp-iam, aws-iam, oidc-auth]")
	loginCmd.Flags().String("client-id", "", "client id for universal auth")
	loginCmd.Flags().String("client-secret", "", "client secret for universal auth")
	loginCmd.Flags().String("machine-identity-id", "", "machine identity id for kubernetes, azure, gcp-id-token, gcp-iam, and aws-iam auth methods")
	loginCmd.Flags().String("service-account-token-path", "", "service account token path for kubernetes auth")
	loginCmd.Flags().String("service-account-key-file-path", "", "service account key file path for GCP IAM auth")
	loginCmd.Flags().String("jwt", "", "jwt for jwt-based auth methods [oidc-auth, jwt-auth]")
	loginCmd.Flags().String("oidc-jwt", "", "JWT for OIDC authentication. Deprecated, use --jwt instead")

	loginCmd.Flags().MarkDeprecated("oidc-jwt", "use --jwt instead")

}

func DomainOverridePrompt() (bool, error) {
	const (
		PRESET   = "Use Domain"
		OVERRIDE = "Change Domain"
	)

	options := []string{PRESET, OVERRIDE}
	//trim the '/' from the end of the domain url
	config.INFISICAL_URL_MANUAL_OVERRIDE = strings.TrimRight(config.INFISICAL_URL_MANUAL_OVERRIDE, "/")
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

func usePresetDomain(presetDomain string) (bool, error) {
	infisicalConfig, err := util.GetConfigFile()
	if err != nil {
		return false, fmt.Errorf("askForDomain: unable to get config file because [err=%s]", err)
	}

	preconfiguredUrl := strings.TrimSuffix(presetDomain, "/api")

	if preconfiguredUrl != "" && preconfiguredUrl != util.INFISICAL_DEFAULT_US_URL && preconfiguredUrl != util.INFISICAL_DEFAULT_EU_URL {
		parsedDomain := strings.TrimSuffix(strings.Trim(preconfiguredUrl, "/"), "/api")

		_, err := url.ParseRequestURI(parsedDomain)
		if err != nil {
			return false, errors.New(fmt.Sprintf("Invalid domain URL: '%s'", parsedDomain))
		}

		config.INFISICAL_URL = fmt.Sprintf("%s/api", parsedDomain)
		config.INFISICAL_LOGIN_URL = fmt.Sprintf("%s/login", parsedDomain)

		if !slices.Contains(infisicalConfig.Domains, parsedDomain) {
			infisicalConfig.Domains = append(infisicalConfig.Domains, parsedDomain)
			err = util.WriteConfigFile(&infisicalConfig)

			if err != nil {
				return false, fmt.Errorf("askForDomain: unable to write domains to config file because [err=%s]", err)
			}
		}

		whilte := color.New(color.FgGreen)
		boldWhite := whilte.Add(color.Bold)
		time.Sleep(time.Second * 1)
		boldWhite.Printf("[INFO] Using domain '%s' from domain flag or INFISICAL_API_URL environment variable\n", parsedDomain)

		return true, nil
	}

	return false, nil
}

func askForDomain() error {

	// query user to choose between Infisical cloud or self-hosting
	const (
		INFISICAL_CLOUD_US = "Infisical Cloud (US Region)"
		INFISICAL_CLOUD_EU = "Infisical Cloud (EU Region)"
		SELF_HOSTING       = "Self-Hosting or Dedicated Instance"
		ADD_NEW_DOMAIN     = "Add a new domain"
	)

	options := []string{INFISICAL_CLOUD_US, INFISICAL_CLOUD_EU, SELF_HOSTING}
	optionsPrompt := promptui.Select{
		Label: "Select your hosting option",
		Items: options,
		Size:  3,
	}

	_, selectedHostingOption, err := optionsPrompt.Run()
	if err != nil {
		return err
	}

	if selectedHostingOption == INFISICAL_CLOUD_US {
		// US cloud option
		config.INFISICAL_URL = fmt.Sprintf("%s/api", util.INFISICAL_DEFAULT_US_URL)
		config.INFISICAL_LOGIN_URL = fmt.Sprintf("%s/login", util.INFISICAL_DEFAULT_US_URL)
		return nil
	} else if selectedHostingOption == INFISICAL_CLOUD_EU {
		// EU cloud option
		config.INFISICAL_URL = fmt.Sprintf("%s/api", util.INFISICAL_DEFAULT_EU_URL)
		config.INFISICAL_LOGIN_URL = fmt.Sprintf("%s/login", util.INFISICAL_DEFAULT_EU_URL)
		return nil
	}

	infisicalConfig, err := util.GetConfigFile()
	if err != nil {
		return fmt.Errorf("askForDomain: unable to get config file because [err=%s]", err)
	}

	if infisicalConfig.Domains != nil && len(infisicalConfig.Domains) > 0 {
		// If domains are present in the config, let the user select from the list or select to add a new domain

		items := append(infisicalConfig.Domains, ADD_NEW_DOMAIN)

		prompt := promptui.Select{
			Label: "Which domain would you like to use?",
			Items: items,
			Size:  5,
		}

		_, selectedOption, err := prompt.Run()
		if err != nil {
			return err
		}

		if selectedOption != ADD_NEW_DOMAIN {
			config.INFISICAL_URL = fmt.Sprintf("%s/api", selectedOption)
			config.INFISICAL_LOGIN_URL = fmt.Sprintf("%s/login", selectedOption)
			return nil

		}

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
		Default:  "Example - https://my-self-hosted-instance.com",
	}

	domain, err := domainPrompt.Run()
	if err != nil {
		return err
	}

	// Trimmed the '/' from the end of the self-hosting url, and set the api & login url
	domain = strings.TrimRight(domain, "/")
	config.INFISICAL_URL = fmt.Sprintf("%s/api", domain)
	config.INFISICAL_LOGIN_URL = fmt.Sprintf("%s/login", domain)

	// Write the new domain to the config file, to allow the user to select it in the future if needed
	// First check if infiscialConfig.Domains already includes the domain, if it does, do not add it again
	if !slices.Contains(infisicalConfig.Domains, domain) {
		infisicalConfig.Domains = append(infisicalConfig.Domains, domain)
		err = util.WriteConfigFile(&infisicalConfig)

		if err != nil {
			return fmt.Errorf("askForDomain: unable to write domains to config file because [err=%s]", err)
		}
	}

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

	fmt.Println("Enter Credentials...")
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
	httpClient, err := util.GetRestyClientWithCustomHeaders()
	if err != nil {
		return nil, nil, err
	}
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
		return nil, nil, err
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
		Password:    password,
	})

	if err != nil {
		util.HandleError(err)
	}

	return &loginOneResponseResult, &loginTwoResponseResult, nil
}

func GetJwtTokenWithOrganizationId(oldJwtToken string, email string) string {
	log.Debug().Msg(fmt.Sprint("GetJwtTokenWithOrganizationId: ", "oldJwtToken", oldJwtToken))

	httpClient, err := util.GetRestyClientWithCustomHeaders()
	if err != nil {
		util.HandleError(err, "Unable to get resty client with custom headers")
	}
	httpClient.SetAuthToken(oldJwtToken)

	organizationResponse, err := api.CallGetAllOrganizations(httpClient)

	if err != nil {
		util.HandleError(err, "Unable to pull organizations that belong to you")
	}

	organizations := organizationResponse.Organizations

	organizationNames := util.GetOrganizationsNameList(organizationResponse)

	prompt := promptui.Select{
		Label: "Which Infisical organization would you like to log into?",
		Items: organizationNames,
	}

	index, _, err := prompt.Run()
	if err != nil {
		util.HandleError(err)
	}

	selectedOrganization := organizations[index]

	selectedOrgRes, err := api.CallSelectOrganization(httpClient, api.SelectOrganizationRequest{OrganizationId: selectedOrganization.ID})
	if err != nil {
		util.HandleError(err)
	}

	if selectedOrgRes.MfaEnabled {
		i := 1
		for i < 6 {
			mfaVerifyCode := askForMFACode(selectedOrgRes.MfaMethod)

			httpClient, err := util.GetRestyClientWithCustomHeaders()
			if err != nil {
				util.HandleError(err, "Unable to get resty client with custom headers")
			}
			httpClient.SetAuthToken(selectedOrgRes.Token)
			verifyMFAresponse, mfaErrorResponse, requestError := api.CallVerifyMfaToken(httpClient, api.VerifyMfaTokenRequest{
				Email:     email,
				MFAToken:  mfaVerifyCode,
				MFAMethod: selectedOrgRes.MfaMethod,
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
				httpClient.SetAuthToken(verifyMFAresponse.Token)
				selectedOrgRes, err = api.CallSelectOrganization(httpClient, api.SelectOrganizationRequest{OrganizationId: selectedOrganization.ID})
				break
			}
		}
	}

	if err != nil {
		util.HandleError(err, "Unable to select organization")
	}

	return selectedOrgRes.Token

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

func askForMFACode(mfaMethod string) string {
	var label string
	if mfaMethod == "totp" {
		label = "Enter the verification code from your mobile authenticator app or use a recovery code"
	} else {
		label = "Enter the 2FA verification code sent to your email"
	}
	mfaCodePromptUI := promptui.Prompt{
		Label: label,
	}

	mfaVerifyCode, err := mfaCodePromptUI.Run()
	if err != nil {
		util.HandleError(err)
	}

	return mfaVerifyCode
}

func askToPasteJwtToken(success chan models.UserCredentials, failure chan error) {
	time.Sleep(time.Second * 5)
	fmt.Println("\n\nOnce login is completed via browser, the CLI should be authenticated automatically.")
	fmt.Println("However, if browser fails to communicate with the CLI, please paste the token from the browser below.")

	fmt.Print("\n\nToken: ")
	bytePassword, err := term.ReadPassword(int(os.Stdin.Fd()))
	if err != nil {
		failure <- err
		fmt.Println("\nError reading input:", err)
		os.Exit(1)
	}

	infisicalPastedToken := strings.TrimSpace(string(bytePassword))

	userCredentials, err := decodePastedBase64Token(infisicalPastedToken)
	if err != nil {
		failure <- err
		fmt.Println("Invalid user credentials provided", err)
		os.Exit(1)
	}

	// verify JTW
	httpClient, err := util.GetRestyClientWithCustomHeaders()
	if err != nil {
		failure <- err
		fmt.Println("Error getting resty client with custom headers", err)
		os.Exit(1)
	}

	httpClient.
		SetAuthToken(userCredentials.JTWToken).
		SetHeader("Accept", "application/json")

	isAuthenticated := api.CallIsAuthenticated(httpClient)
	if !isAuthenticated {
		fmt.Println("Invalid user credentials provided", err)
		failure <- err
		os.Exit(1)
	}

	success <- *userCredentials
}

func decodePastedBase64Token(token string) (*models.UserCredentials, error) {
	data, err := base64.StdEncoding.DecodeString(token)
	if err != nil {
		return nil, err
	}
	var loginResponse models.UserCredentials

	err = json.Unmarshal(data, &loginResponse)
	if err != nil {
		return nil, err
	}

	return &loginResponse, nil
}

// Manages the browser login flow.
// Returns a UserCredentials object on success and an error on failure
func browserCliLogin() (models.UserCredentials, error) {
	SERVER_TIMEOUT := 10 * 60

	//create listener
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return models.UserCredentials{}, err
	}

	//get callback port
	callbackPort := listener.Addr().(*net.TCPAddr).Port
	url := fmt.Sprintf("%s?callback_port=%d", config.INFISICAL_LOGIN_URL, callbackPort)

	defaultPrintStatement := fmt.Sprintf("\n\nTo complete your login, open this address in your browser: %v \n", url)

	if runtime.GOOS == "darwin" || runtime.GOOS == "windows" {
		if err := browser.OpenURL(url); err != nil {
			fmt.Print(defaultPrintStatement)
		} else {
			fmt.Printf("\n\nPlease proceed to your browser to complete the login process.\nIf the browser doesn't open automatically, please open this address in your browser: %v \n", url)
		}
	} else {
		fmt.Print(defaultPrintStatement)
	}

	//flow channels
	success := make(chan models.UserCredentials)
	failure := make(chan error)
	timeout := time.After(time.Second * time.Duration(SERVER_TIMEOUT))

	//terminal state
	oldState, err := term.GetState(int(os.Stdin.Fd()))
	if err != nil {
		return models.UserCredentials{}, err
	}

	defer restoreTerminal(oldState)

	//create handler
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{strings.ReplaceAll(config.INFISICAL_LOGIN_URL, "/login", "")},
		AllowCredentials: true,
		AllowedMethods:   []string{"POST", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		Debug:            false,
	})
	corsHandler := c.Handler(browserLoginHandler(success, failure))

	log.Debug().Msgf("Callback server listening on port %d", callbackPort)

	go http.Serve(listener, corsHandler)
	go askToPasteJwtToken(success, failure)

	for {
		select {
		case loginResponse := <-success:
			_ = closeListener(&listener)
			fmt.Println("Browser login successful")
			return loginResponse, nil

		case err := <-failure:
			serverErr := closeListener(&listener)
			return models.UserCredentials{}, errors.Join(err, serverErr)

		case <-timeout:
			_ = closeListener(&listener)
			return models.UserCredentials{}, errors.New("server timeout")
		}
	}
}

func restoreTerminal(oldState *term.State) {
	term.Restore(int(os.Stdin.Fd()), oldState)
}

// // listens to 'q' input on terminal and
// // sends 'true' to 'quit' channel
// func quitBrowserLogin(quit chan bool, oState *term.State) {
// 	oldState, err := term.MakeRaw(int(os.Stdin.Fd()))
// 	if err != nil {
// 		return
// 	}
// 	*oState = *oldState
// 	defer restoreTerminal(oldState)
// 	b := make([]byte, 1)
// 	for {
// 		_, _ = os.Stdin.Read(b)
// 		if string(b) == QUIT_BROWSER_LOGIN {
// 			quit <- true
// 			break
// 		}
// 	}
// }

func closeListener(listener *net.Listener) error {
	err := (*listener).Close()
	if err != nil {
		return err
	}
	log.Debug().Msg("Callback server shutdown successfully")
	return nil
}

func browserLoginHandler(success chan models.UserCredentials, failure chan error) http.HandlerFunc {

	return func(w http.ResponseWriter, r *http.Request) {
		var loginResponse models.UserCredentials

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&loginResponse)
		if err != nil {
			failure <- err
		}

		w.WriteHeader(http.StatusOK)
		success <- loginResponse

	}
}
