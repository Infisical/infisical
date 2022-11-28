/*
Copyright © 2022 NAME HERE <EMAIL ADDRESS>
*/
package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"

	"github.com/Infisical/infisical/packages/models"
	"github.com/Infisical/infisical/packages/util"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

// runCmd represents the run command
var runCmd = &cobra.Command{
	Use:                   "run [any infisical run command flags] -- [your application start command]",
	Short:                 "Used to inject environments variables into your application process",
	DisableFlagsInUseLine: true,
	Example:               "infisical run --env=prod -- npm run dev",
	Args:                  cobra.MinimumNArgs(1),
	PreRun:                toggleDebug,
	Run: func(cmd *cobra.Command, args []string) {
		envName, err := cmd.Flags().GetString("env")
		if err != nil {
			log.Errorln("Unable to parse the environment flag")
			log.Debugln(err)
			return
		}

		shouldExpandSecrets, err := cmd.Flags().GetBool("expand")
		if err != nil {
			log.Errorln("Unable to parse the substitute flag")
			log.Debugln(err)
			return
		}

		projectId, err := cmd.Flags().GetString("projectId")
		if err != nil {
			log.Errorln("Unable to parse the project id flag")
			log.Debugln(err)
			return
		}

		var envsFromApi []models.SingleEnvironmentVariable
		infisicalToken := os.Getenv(util.INFISICAL_TOKEN_NAME)
		if infisicalToken == "" {
			hasUserLoggedInbefore, loggedInUserEmail, err := util.IsUserLoggedIn()
			if err != nil {
				log.Info("Unexpected issue occurred while checking login status. To see more details, add flag --debug")
				log.Debugln(err)
				return
			}

			if !hasUserLoggedInbefore {
				log.Infoln("No logged in user. To login, please run command [infisical login]")
				return
			}

			userCreds, err := util.GetUserCredsFromKeyRing(loggedInUserEmail)
			if err != nil {
				log.Infoln("Unable to get user creds from key ring")
				log.Debug(err)
				return
			}

			if !util.WorkspaceConfigFileExists() {
				log.Infoln("Your project is not connected to a project yet. Run command [infisical init]")
				return
			}

			envsFromApi, err = util.GetSecretsFromAPIUsingCurrentLoggedInUser(envName, userCreds)
			if err != nil {
				log.Errorln("Something went wrong when pulling secrets using your logged in credentials. If the issue persists, double check your project id/try logging in again.")
				log.Debugln(err)
				return
			}
		} else {
			envsFromApi, err = util.GetSecretsFromAPIUsingInfisicalToken(infisicalToken, envName, projectId)
			if err != nil {
				log.Errorln("Something went wrong when pulling secrets using your Infisical token. Double check the token, project id or environment name (dev, prod, ect.)")
				log.Debugln(err)
				return
			}
		}

		if shouldExpandSecrets {
			substitutions := util.SubstituteSecrets(envsFromApi)
			execCmd(args[0], args[1:], substitutions)
		} else {
			execCmd(args[0], args[1:], envsFromApi)
		}

	},
}

func init() {
	rootCmd.AddCommand(runCmd)
	runCmd.Flags().StringP("env", "e", "dev", "Set the environment (dev, prod, etc.) from which your secrets should be pulled from")
	runCmd.Flags().String("projectId", "", "The project ID from which your secrets should be pulled from")
	runCmd.Flags().Bool("expand", true, "Parse shell parameter expansions in your secrets")
}

// Credit: inspired by AWS Valut
func execCmd(command string, args []string, envs []models.SingleEnvironmentVariable) error {
	log.Infof("\x1b[%dm%s\x1b[0m", 32, "\u2713 Injected Infisical secrets into your application process successfully")
	log.Debugln("Secrets to inject:", envs)
	log.Debugf("executing command: %s %s \n", command, strings.Join(args, " "))
	cmd := exec.Command(command, args...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = getAllEnvs(envs)

	sigChannel := make(chan os.Signal, 1)
	signal.Notify(sigChannel)

	if err := cmd.Start(); err != nil {
		return err
	}

	go func() {
		for {
			sig := <-sigChannel
			_ = cmd.Process.Signal(sig) // process all sigs
		}
	}()

	if err := cmd.Wait(); err != nil {
		_ = cmd.Process.Signal(os.Kill)
		return fmt.Errorf("Failed to wait for command termination: %v", err)
	}

	waitStatus := cmd.ProcessState.Sys().(syscall.WaitStatus)
	os.Exit(waitStatus.ExitStatus())
	return nil
}

func getAllEnvs(envsToInject []models.SingleEnvironmentVariable) []string {
	env_map := make(map[string]string)

	for _, env := range os.Environ() {
		splitEnv := strings.Split(env, "=")
		env_map[splitEnv[0]] = splitEnv[1]
	}

	for _, env := range envsToInject {
		env_map[env.Key] = env.Value // overrite any envs with ones to inject if they clash
	}

	var allEnvs []string
	for key, value := range env_map {
		allEnvs = append(allEnvs, fmt.Sprintf("%s=%s", key, value))
	}

	return allEnvs
}
