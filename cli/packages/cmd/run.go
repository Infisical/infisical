/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/fatih/color"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

// runCmd represents the run command
var runCmd = &cobra.Command{
	Example: `
	infisical run --env=dev -- npm run dev
	infisical run --command "first-command && second-command; more-commands..."
	`,
	Use:                   "run [any infisical run command flags] -- [your application start command]",
	Short:                 "Used to inject environments variables into your application process",
	DisableFlagsInUseLine: true,
	PreRun:                toggleDebug,
	Args: func(cmd *cobra.Command, args []string) error {
		// Check if the --command flag has been set
		commandFlagSet := cmd.Flags().Changed("command")

		// If the --command flag has been set, check if a value was provided
		if commandFlagSet {
			command := cmd.Flag("command").Value.String()
			if command == "" {
				return fmt.Errorf("you need to provide a command after the flag --command")
			}

			// If the --command flag has been set, args should not be provided
			if len(args) > 0 {
				return fmt.Errorf("you cannot set any arguments after --command flag. --command only takes a string command")
			}
		} else {
			// If the --command flag has not been set, at least one arg should be provided
			if len(args) == 0 {
				return fmt.Errorf("at least one argument is required after the run command, received %d", len(args))
			}
		}

		return nil
	},
	Run: func(cmd *cobra.Command, args []string) {
		envName, err := cmd.Flags().GetString("env")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		infisicalToken, err := cmd.Flags().GetString("token")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		secretOverriding, err := cmd.Flags().GetBool("secret-overriding")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		shouldExpandSecrets, err := cmd.Flags().GetBool("expand")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		secrets, err := util.GetAllEnvironmentVariables(models.GetAllSecretsParameters{Environment: envName, InfisicalToken: infisicalToken})

		if err != nil {
			util.HandleError(err, "Could not fetch secrets", "If you are using a service token to fetch secrets, please ensure it is valid")
		}

		if secretOverriding {
			secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_PERSONAL)
		} else {
			secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_SHARED)
		}

		if shouldExpandSecrets {
			secrets = util.SubstituteSecrets(secrets)
		}

		secretsByKey := getSecretsByKeys(secrets)
		environmentVariables := make(map[string]string)

		// add all existing environment vars
		for _, s := range os.Environ() {
			kv := strings.SplitN(s, "=", 2)
			key := kv[0]
			value := kv[1]
			environmentVariables[key] = value
		}

		// check to see if there are any reserved key words in secrets to inject
		reservedEnvironmentVariables := []string{"HOME", "PATH", "PS1", "PS2"}
		for _, reservedEnvName := range reservedEnvironmentVariables {
			if _, ok := secretsByKey[reservedEnvName]; ok {
				delete(secretsByKey, reservedEnvName)
				util.PrintWarning(fmt.Sprintf("Infisical secret named [%v] has been removed because it is a reserved secret name", reservedEnvName))
			}
		}

		// now add infisical secrets
		for k, v := range secretsByKey {
			environmentVariables[k] = v.Value
		}

		// turn it back into a list of envs
		var env []string
		for key, value := range environmentVariables {
			s := key + "=" + value
			env = append(env, s)
		}

		log.Debugf("injecting the following environment variables into shell: %v", env)

		if cmd.Flags().Changed("command") {
			command := cmd.Flag("command").Value.String()

			err = executeMultipleCommandWithEnvs(command, len(secretsByKey), env)
			if err != nil {
				util.HandleError(err, "Unable to execute your chained command")
			}

		} else {
			err = executeSingleCommandWithEnvs(args, len(secretsByKey), env)
			if err != nil {
				util.HandleError(err, "Unable to execute your single command")
			}
		}
	},
}

func init() {
	rootCmd.AddCommand(runCmd)
	runCmd.Flags().String("token", "", "Fetch secrets using the Infisical Token")
	runCmd.Flags().StringP("env", "e", "dev", "Set the environment (dev, prod, etc.) from which your secrets should be pulled from")
	runCmd.Flags().Bool("expand", true, "Parse shell parameter expansions in your secrets")
	runCmd.Flags().Bool("secret-overriding", true, "Prioritizes personal secrets, if any, with the same name over shared secrets")
	runCmd.Flags().StringP("command", "c", "", "chained commands to execute (e.g. \"npm install && npm run dev; echo ...\")")
}

// Will execute a single command and pass in the given secrets into the process
func executeSingleCommandWithEnvs(args []string, secretsCount int, env []string) error {
	command := args[0]
	argsForCommand := args[1:]
	color.Green("Injecting %v Infisical secrets into your application process", secretsCount)

	cmd := exec.Command(command, argsForCommand...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = env

	return execCmd(cmd)
}

func executeMultipleCommandWithEnvs(fullCommand string, secretsCount int, env []string) error {
	shell := [2]string{"sh", "-c"}
	if runtime.GOOS == "windows" {
		shell = [2]string{"cmd", "/C"}
	} else {
		currentShell := os.Getenv("SHELL")
		if currentShell != "" {
			shell[0] = currentShell
		}
	}

	cmd := exec.Command(shell[0], shell[1], fullCommand)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = env

	color.Green("Injecting %v Infisical secrets into your application process", secretsCount)
	log.Debugf("executing command: %s %s %s \n", shell[0], shell[1], fullCommand)

	return execCmd(cmd)
}

// Credit: inspired by AWS Valut
func execCmd(cmd *exec.Cmd) error {
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
		return fmt.Errorf("failed to wait for command termination: %v", err)
	}

	waitStatus := cmd.ProcessState.Sys().(syscall.WaitStatus)
	os.Exit(waitStatus.ExitStatus())
	return nil
}
