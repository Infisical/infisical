/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/fatih/color"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
)

var ErrManualSignalInterrupt = errors.New("signal: interrupt")
var watcherWaitGroup = new(sync.WaitGroup)

// runCmd represents the run command
var runCmd = &cobra.Command{
	Example: `
	infisical run --env=dev -- npm run dev
	infisical run --command "first-command && second-command; more-commands..."
	`,
	Use:                   "run [any infisical run command flags] -- [your application start command]",
	Short:                 "Used to inject environments variables into your application process",
	DisableFlagsInUseLine: true,
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
		environmentName, _ := cmd.Flags().GetString("env")
		if !cmd.Flags().Changed("env") {
			environmentFromWorkspace := util.GetEnvFromWorkspaceFile()
			if environmentFromWorkspace != "" {
				environmentName = environmentFromWorkspace
			}
		}

		token, err := util.GetInfisicalToken(cmd)
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		projectConfigDir, err := cmd.Flags().GetString("project-config-dir")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		projectId, err := cmd.Flags().GetString("projectId")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		command, err := cmd.Flags().GetString("command")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		secretOverriding, err := cmd.Flags().GetBool("secret-overriding")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		watchMode, err := cmd.Flags().GetBool("watch")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		watchModeInterval, err := cmd.Flags().GetInt("watch-interval")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		// If the --watch flag has been set, the --watch-interval flag should also be set
		if watchMode && watchModeInterval < 5 {
			util.HandleError(fmt.Errorf("watch interval must be at least 5 seconds, you passed %d seconds", watchModeInterval))
		}

		shouldExpandSecrets, err := cmd.Flags().GetBool("expand")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		tagSlugs, err := cmd.Flags().GetString("tags")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		secretsPath, err := cmd.Flags().GetString("path")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		includeImports, err := cmd.Flags().GetBool("include-imports")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		recursive, err := cmd.Flags().GetBool("recursive")
		if err != nil {
			util.HandleError(err, "Unable to parse flag")
		}

		request := models.GetAllSecretsParameters{
			Environment:            environmentName,
			WorkspaceId:            projectId,
			TagSlugs:               tagSlugs,
			SecretsPath:            secretsPath,
			IncludeImport:          includeImports,
			Recursive:              recursive,
			ExpandSecretReferences: shouldExpandSecrets,
		}

		injectableEnvironment, err := fetchAndFormatSecretsForShell(request, projectConfigDir, secretOverriding, token)
		if err != nil {
			util.HandleError(err, "Could not fetch secrets", "If you are using a service token to fetch secrets, please ensure it is valid")
		}

		log.Debug().Msgf("injecting the following environment variables into shell: %v", injectableEnvironment.Variables)

		if watchMode {
			executeCommandWithWatchMode(command, args, watchModeInterval, request, projectConfigDir, secretOverriding, token)
		} else {
			if cmd.Flags().Changed("command") {
				command := cmd.Flag("command").Value.String()
				err = executeMultipleCommandWithEnvs(command, injectableEnvironment.SecretsCount, injectableEnvironment.Variables)
				if err != nil {
					fmt.Println(err)
					os.Exit(1)
				}

			} else {
				err = executeSingleCommandWithEnvs(args, injectableEnvironment.SecretsCount, injectableEnvironment.Variables)
				if err != nil {
					fmt.Println(err)
					os.Exit(1)
				}
			}
		}

	},
}

func filterReservedEnvVars(env map[string]models.SingleEnvironmentVariable) {
	var (
		reservedEnvVars = []string{
			"HOME", "PATH", "PS1", "PS2",
			"PWD", "EDITOR", "XAUTHORITY", "USER",
			"TERM", "TERMINFO", "SHELL", "MAIL",
		}

		reservedEnvVarPrefixes = []string{
			"XDG_",
			"LC_",
		}
	)

	for _, reservedEnvName := range reservedEnvVars {
		if _, ok := env[reservedEnvName]; ok {
			delete(env, reservedEnvName)
			util.PrintWarning(fmt.Sprintf("Infisical secret named [%v] has been removed because it is a reserved secret name", reservedEnvName))
		}
	}

	for _, reservedEnvPrefix := range reservedEnvVarPrefixes {
		for envName := range env {
			if strings.HasPrefix(envName, reservedEnvPrefix) {
				delete(env, envName)
				util.PrintWarning(fmt.Sprintf("Infisical secret named [%v] has been removed because it contains a reserved prefix", envName))
			}
		}
	}
}

func init() {
	rootCmd.AddCommand(runCmd)
	runCmd.Flags().String("token", "", "fetch secrets using service token or machine identity access token")
	runCmd.Flags().String("projectId", "", "manually set the project ID to fetch secrets from when using machine identity based auth")
	runCmd.Flags().StringP("env", "e", "dev", "set the environment (dev, prod, etc.) from which your secrets should be pulled from")
	runCmd.Flags().Bool("expand", true, "parse shell parameter expansions in your secrets")
	runCmd.Flags().Bool("include-imports", true, "import linked secrets ")
	runCmd.Flags().Bool("recursive", false, "fetch secrets from all sub-folders")
	runCmd.Flags().Bool("secret-overriding", true, "prioritizes personal secrets, if any, with the same name over shared secrets")
	runCmd.Flags().Bool("watch", false, "enable reload of application when secrets change")
	runCmd.Flags().Int("watch-interval", 10, "interval in seconds to check for secret changes")
	runCmd.Flags().StringP("command", "c", "", "chained commands to execute (e.g. \"npm install && npm run dev; echo ...\")")
	runCmd.Flags().StringP("tags", "t", "", "filter secrets by tag slugs ")
	runCmd.Flags().String("path", "/", "get secrets within a folder path")
	runCmd.Flags().String("project-config-dir", "", "explicitly set the directory where the .infisical.json resides")
}

// Will execute a single command and pass in the given secrets into the process
func executeSingleCommandWithEnvs(args []string, secretsCount int, env []string) error {
	command := args[0]
	argsForCommand := args[1:]

	log.Info().Msgf(color.GreenString("Injecting %v Infisical secrets into your application process", secretsCount))

	cmd := exec.Command(command, argsForCommand...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = env

	return execBasicCmd(cmd)
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

	log.Info().Msgf(color.GreenString("Injecting %v Infisical secrets into your application process", secretsCount))
	log.Debug().Msgf("executing command: %s %s %s \n", shell[0], shell[1], fullCommand)

	return execBasicCmd(cmd)
}

func execBasicCmd(cmd *exec.Cmd) error {
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

func waitForExitCommand(cmd *exec.Cmd) (int, error) {
	if err := cmd.Wait(); err != nil {
		// ignore errors
		cmd.Process.Signal(os.Kill) // #nosec G104

		if exitError, ok := err.(*exec.ExitError); ok {
			return exitError.ExitCode(), exitError
		}

		return 2, err
	}

	waitStatus, ok := cmd.ProcessState.Sys().(syscall.WaitStatus)
	if !ok {
		return 2, fmt.Errorf("unexpected ProcessState type, expected syscall.WaitStatus, got %T", waitStatus)
	}
	return waitStatus.ExitStatus(), nil
}

func executeCommandWithWatchMode(commandFlag string, args []string, watchModeInterval int, request models.GetAllSecretsParameters, projectConfigDir string, secretOverriding bool, token *models.TokenDetails) {

	var cmd *exec.Cmd
	var err error
	var lastSecretsFetch time.Time
	var lastUpdateEvent time.Time
	var watchMutex sync.Mutex
	var processMutex sync.Mutex
	var beingTerminated = false
	var currentETag string

	if err != nil {
		util.HandleError(err, "Failed to fetch secrets")
	}

	runCommandWithWatcher := func(environmentVariables models.InjectableEnvironmentResult) {
		currentETag = environmentVariables.ETag
		secretsFetchedAt := time.Now()
		if secretsFetchedAt.After(lastSecretsFetch) {
			lastSecretsFetch = secretsFetchedAt
		}

		shouldRestartProcess := cmd != nil
		// terminate the old process before starting a new one
		if shouldRestartProcess {
			log.Info().Msg(color.HiMagentaString("[HOT RELOAD] Environment changes detected. Reloading process..."))
			beingTerminated = true

			log.Debug().Msgf(color.HiMagentaString("[HOT RELOAD] Sending SIGTERM to PID %d", cmd.Process.Pid))
			if e := cmd.Process.Signal(syscall.SIGTERM); e != nil {
				log.Error().Err(e).Msg(color.HiMagentaString("[HOT RELOAD] Failed to send SIGTERM"))
			}
			// wait up to 10 sec for the process to exit
			for i := 0; i < 10; i++ {
				if !util.IsProcessRunning(cmd.Process) {
					// process has been killed so we break out
					break
				}
				if i == 5 {
					log.Debug().Msg(color.HiMagentaString("[HOT RELOAD] Still waiting for process exit status"))
				}
				time.Sleep(time.Second)
			}

			// SIGTERM may not work on Windows so we try SIGKILL
			if util.IsProcessRunning(cmd.Process) {
				log.Debug().Msg(color.HiMagentaString("[HOT RELOAD] Process still hasn't fully exited, attempting SIGKILL"))
				if e := cmd.Process.Kill(); e != nil {
					log.Error().Err(e).Msg(color.HiMagentaString("[HOT RELOAD] Failed to send SIGKILL"))
				}
			}

			cmd = nil
		} else {
			// If `cmd` is nil, we know this is the first time we are starting the process
			log.Info().Msg(color.HiMagentaString("[HOT RELOAD] Watching for secret changes..."))
		}

		processMutex.Lock()

		if lastUpdateEvent.After(secretsFetchedAt) {
			processMutex.Unlock()
			return
		}

		beingTerminated = false
		watcherWaitGroup.Add(1)

		// start the process
		log.Info().Msgf(color.GreenString("Injecting %v Infisical secrets into your application process", environmentVariables.SecretsCount))

		cmd, err = util.RunCommand(commandFlag, args, environmentVariables.Variables, false)
		if err != nil {
			defer watcherWaitGroup.Done()
			util.HandleError(err)
		}

		go func() {
			defer processMutex.Unlock()
			defer watcherWaitGroup.Done()

			exitCode, err := waitForExitCommand(cmd)

			// ignore errors if we are being terminated
			if !beingTerminated {
				if err != nil {
					if strings.HasPrefix(err.Error(), "exec") || strings.HasPrefix(err.Error(), "fork/exec") {
						log.Error().Err(err).Msg("Failed to execute command")
					}
					if err.Error() != ErrManualSignalInterrupt.Error() {
						log.Error().Err(err).Msg("Process exited with error")
					}
				}

				os.Exit(exitCode)
			}
		}()
	}

	recheckSecretsChannel := make(chan bool, 1)
	recheckSecretsChannel <- true

	// a simple goroutine that triggers the recheckSecretsChan every watch interval (defaults to 10 seconds)
	go func() {
		for {
			time.Sleep(time.Duration(watchModeInterval) * time.Second)
			recheckSecretsChannel <- true
		}
	}()

	for {
		<-recheckSecretsChannel
		watchMutex.Lock()

		newEnvironmentVariables, err := fetchAndFormatSecretsForShell(request, projectConfigDir, secretOverriding, token)
		if err != nil {
			log.Error().Err(err).Msg("[HOT RELOAD] Failed to fetch secrets")
			continue
		}

		if newEnvironmentVariables.ETag != currentETag {
			runCommandWithWatcher(newEnvironmentVariables)
		} else {
			log.Debug().Msg("[HOT RELOAD] No changes detected in secrets, not reloading process")
		}

		watchMutex.Unlock()

	}
}

func fetchAndFormatSecretsForShell(request models.GetAllSecretsParameters, projectConfigDir string, secretOverriding bool, token *models.TokenDetails) (models.InjectableEnvironmentResult, error) {

	if token != nil && token.Type == util.SERVICE_TOKEN_IDENTIFIER {
		request.InfisicalToken = token.Token
	} else if token != nil && token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER {
		request.UniversalAuthAccessToken = token.Token
	}

	secrets, err := util.GetAllEnvironmentVariables(request, projectConfigDir)

	if err != nil {
		return models.InjectableEnvironmentResult{}, err
	}

	if secretOverriding {
		secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_PERSONAL)
	} else {
		secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_SHARED)
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
	filterReservedEnvVars(secretsByKey)

	// now add infisical secrets
	for k, v := range secretsByKey {
		environmentVariables[k] = v.Value
	}

	env := make([]string, 0, len(environmentVariables))
	for key, value := range environmentVariables {
		env = append(env, key+"="+value)
	}

	return models.InjectableEnvironmentResult{
		Variables:    env,
		ETag:         util.GenerateETagFromSecrets(secrets),
		SecretsCount: len(secretsByKey),
	}, nil
}
