/*
Copyright © 2022 NAME HERE <EMAIL ADDRESS>
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
	log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

// runCmd represents the run command
var runCmd = &cobra.Command{
	Example:               "infisical run --env=prod -- npm run dev",
	Use:                   "run [any infisical run command flags] -- [your application start command]",
	Short:                 "Used to inject environments variables into your application process",
	DisableFlagsInUseLine: true,
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

		secrets, err := util.GetAllEnvironmentVariables(projectId, envName)
		if err != nil {
			log.Debugln(err)
			return
		}

		if shouldExpandSecrets {
			secrets = util.SubstituteSecrets(secrets)
		}

		if cmd.Flags().Changed("command") {
			command := cmd.Flag("command").Value.String()
			_ = executeMultipleCommandWithEnvs(command, secrets)
		} else {
			_ = executeSingleCommandWithEnvs(args, secrets)
		}

	},
}

func init() {
	rootCmd.AddCommand(runCmd)
	runCmd.Flags().StringP("env", "e", "dev", "Set the environment (dev, prod, etc.) from which your secrets should be pulled from")
	runCmd.Flags().String("projectId", "", "The project ID from which your secrets should be pulled from")
	runCmd.Flags().Bool("expand", true, "Parse shell parameter expansions in your secrets")
	runCmd.Flags().String("command", "", "command to execute (e.g. \"npm install && npm run dev\")")
}

// Will execute a single command and pass in the given secrets into the process
func executeSingleCommandWithEnvs(args []string, secrets []models.SingleEnvironmentVariable) error {
	command := args[0]
	argsForCommand := args[1:]
	numberOfSecretsInjected := fmt.Sprintf("\u2713 Injected %v Infisical secrets into your application process successfully", len(secrets))
	log.Infof("\x1b[%dm%s\x1b[0m", 32, numberOfSecretsInjected)
	log.Debugf("executing command: %s %s \n", command, strings.Join(argsForCommand, " "))
	log.Debugln("Secrets injected:", secrets)

	cmd := exec.Command(command, argsForCommand...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = getAllEnvs(secrets)

	return execCmd(cmd)
}

func executeMultipleCommandWithEnvs(fullCommand string, secrets []models.SingleEnvironmentVariable) error {
	shell := [2]string{"sh", "-c"}
	if runtime.GOOS == "windows" {
		shell = [2]string{"cmd", "/C"}
	} else {
		shell[0] = os.Getenv("SHELL")
	}

	cmd := exec.Command(shell[0], shell[1], fullCommand)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = getAllEnvs(secrets)

	numberOfSecretsInjected := fmt.Sprintf("\u2713 Injected %v Infisical secrets into your application process successfully", len(secrets))
	log.Infof("\x1b[%dm%s\x1b[0m", 32, numberOfSecretsInjected)
	log.Debugf("executing command: %s %s %s \n", shell[0], shell[1], fullCommand)
	log.Debugln("Secrets injected:", secrets)

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
