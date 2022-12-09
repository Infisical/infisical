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

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
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

		secrets, err := util.GetAllEnvironmentVariables(projectId, envName)
		if err != nil {
			log.Debugln(err)
			return
		}

		if shouldExpandSecrets {
			secretsWithSubstitutions := util.SubstituteSecrets(secrets)
			execCmd(args[0], args[1:], secretsWithSubstitutions)
		} else {
			execCmd(args[0], args[1:], secrets)
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
	numberOfSecretsInjected := fmt.Sprintf("\u2713 Injected %v Infisical secrets into your application process successfully", len(envs))

	log.Infof("\x1b[%dm%s\x1b[0m", 32, numberOfSecretsInjected)
	log.Debugf("executing command: %s %s \n", command, strings.Join(args, " "))
	log.Debugln("Secrets injected:", envs)

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
