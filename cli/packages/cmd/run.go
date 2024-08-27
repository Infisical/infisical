/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/Infisical/infisical-merge/packages/models"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/fatih/color"
	"github.com/posthog/posthog-go"
	"github.com/rs/zerolog/log"
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

		hotReloadEnabled, err := cmd.Flags().GetBool("watch")
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
			Environment:   environmentName,
			WorkspaceId:   projectId,
			TagSlugs:      tagSlugs,
			SecretsPath:   secretsPath,
			IncludeImport: includeImports,
			Recursive:     recursive,
		}

		env, initialETag, err := createInjectableEnvironment(request, projectConfigDir, secretOverriding, shouldExpandSecrets, token)
		if err != nil {
			util.HandleError(err, "Could not fetch secrets", "If you are using a service token to fetch secrets, please ensure it is valid")
		}

		log.Debug().Msgf("injecting the following environment variables into shell: %v", env)

		Telemetry.CaptureEvent("cli-command:run",
			posthog.NewProperties().
				Set("secretsCount", len(env)).
				Set("environment", environmentName).
				Set("isUsingServiceToken", token != nil && token.Type == util.SERVICE_TOKEN_IDENTIFIER).
				Set("isUsingUniversalAuthToken", token != nil && token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER).
				Set("single-command", strings.Join(args, " ")).
				Set("multi-command", cmd.Flag("command").Value.String()).
				Set("version", util.CLI_VERSION))

		hotReloadParameters := models.ExecuteCommandHotReloadParameters{
			Enabled:           hotReloadEnabled,
			GetSecretsDetails: request,
			ProjectConfigDir:  projectConfigDir,
			SecretOverriding:  secretOverriding,
			ExpandSecrets:     shouldExpandSecrets,
			InitialETag:       initialETag,
		}

		if cmd.Flags().Changed("command") {
			command := cmd.Flag("command").Value.String()

			executeMultipleCommandWithEnvs(command, len(env), env, hotReloadParameters, token)

		} else {
			executeSingleCommandWithEnvs(args, len(env), env, hotReloadParameters, token)

		}
	},
}

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

func filterReservedEnvVars(env map[string]models.SingleEnvironmentVariable) {
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
	runCmd.Flags().String("token", "", "Fetch secrets using service token or machine identity access token")
	runCmd.Flags().String("projectId", "", "manually set the project ID to fetch secrets from when using machine identity based auth")
	runCmd.Flags().StringP("env", "e", "dev", "Set the environment (dev, prod, etc.) from which your secrets should be pulled from")
	runCmd.Flags().Bool("expand", true, "Parse shell parameter expansions in your secrets")
	runCmd.Flags().Bool("include-imports", true, "Import linked secrets ")
	runCmd.Flags().Bool("recursive", false, "Fetch secrets from all sub-folders")
	runCmd.Flags().Bool("secret-overriding", true, "Prioritizes personal secrets, if any, with the same name over shared secrets")
	runCmd.Flags().Bool("watch", false, "Enable reload of application when secrets change")
	runCmd.Flags().StringP("command", "c", "", "chained commands to execute (e.g. \"npm install && npm run dev; echo ...\")")
	runCmd.Flags().StringP("tags", "t", "", "filter secrets by tag slugs ")
	runCmd.Flags().String("path", "/", "get secrets within a folder path")
	runCmd.Flags().String("project-config-dir", "", "explicitly set the directory where the .infisical.json resides")
}

// Will execute a single command and pass in the given secrets into the process
func executeSingleCommandWithEnvs(args []string, secretsCount int, env []string, reloadParameters models.ExecuteCommandHotReloadParameters, token *models.TokenDetails) {
	ctx, cancelCtx := context.WithCancel(context.Background())
	defer cancelCtx()

	// Set up signal handling
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	if reloadParameters.Enabled {
		log.Info().Msgf(color.YellowString("[HOT RELOAD] Watching for secret changes..."))
		go func() {
			<-sigChan
			log.Info().Msg("Received termination signal. Cleaning up...")
			cancelCtx()
		}()
	}

	var cmd *exec.Cmd

	startCmd := func() error {
		command := args[0]
		argsForCommand := args[1:]

		log.Info().Msgf(color.GreenString("Injecting %v Infisical secrets into your application process", secretsCount))

		cmd := exec.Command(command, argsForCommand...)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Env = env

		if reloadParameters.Enabled {
			go func() {
				execCommandWithReload(cmd, cancelCtx)
			}()
		} else {
			return execCmd(cmd)
		}
		return nil
	}

	err := startCmd() // Initial command start, if no --watch flag is passed, it will work like in old versions of infisical CLI.
	if err != nil {
		util.HandleError(err, "Failed to start command")
	}

	// This part is only relevant when the --watch flag is passed, as it's purpose is to solely watch for changes and manage process reloads.
	if reloadParameters.Enabled {
		ticker := time.NewTicker(10 * time.Second) // We check every 10 seconds for secret changes
		defer ticker.Stop()

		for {
			select {

			case <-ctx.Done():
				log.Debug().Msg("Exiting hot reload...")
				handleCommandTermination(cmd, cancelCtx)
				return
			case <-ticker.C:
				log.Debug().Msg("Checking for environment updates...")
				newEnv, newEtag, err := createInjectableEnvironment(
					reloadParameters.GetSecretsDetails,
					reloadParameters.ProjectConfigDir,
					reloadParameters.SecretOverriding,
					reloadParameters.ExpandSecrets,
					token,
				)
				if err != nil {
					log.Error().Err(err).Msg("Failed to fetch new secrets")
					continue
				}

				if newEtag != reloadParameters.InitialETag {
					log.Info().Msg("[HOT RELOAD] Environment changed. Reloading application...")
					reloadParameters.InitialETag = newEtag
					env = newEnv
					secretsCount = len(newEnv)
					startCmd() // Restart the command with new environment
				} else {
					log.Debug().Msg("Not reloading because environments are identical")
				}
			}
		}
	}
}
func executeMultipleCommandWithEnvs(fullCommand string, secretsCount int, env []string, reloadParameters models.ExecuteCommandHotReloadParameters, token *models.TokenDetails) {
	ctx, cancelCtx := context.WithCancel(context.Background())
	defer cancelCtx()

	// Set up signal handling
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	if reloadParameters.Enabled {
		log.Info().Msgf(color.HiMagentaString("[HOT RELOAD] Watching for secret changes..."))
		go func() {
			<-sigChan
			log.Info().Msg(color.HiMagentaString("Received termination signal. Cleaning up..."))
			cancelCtx()
		}()
	}

	var cmd *exec.Cmd

	startCmd := func() error {
		shell := [2]string{"sh", "-c"}
		if runtime.GOOS == "windows" {
			shell = [2]string{"cmd", "/C"}
		} else {
			currentShell := os.Getenv("SHELL")
			if currentShell != "" {
				shell[0] = currentShell
			}
		}

		cmd = exec.CommandContext(ctx, shell[0], shell[1], fullCommand)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Env = env

		log.Info().Msgf(color.GreenString("Injecting %v Infisical secrets into your application process", secretsCount))
		log.Debug().Msgf("executing command: %s %s %s \n", shell[0], shell[1], fullCommand)

		if reloadParameters.Enabled {
			go func() {
				execCommandWithReload(cmd, cancelCtx)
			}()
		} else {
			return execCmd(cmd)
		}
		return nil
	}

	err := startCmd() // Initial command start, if no --watch flag is passed, it will work like in old versions of infisical CLI.
	if err != nil {
		util.HandleError(err, "Failed to start command")
	}

	// This part is only relevant when the --watch flag is passed, as it's purpose is to solely watch for changes and manage process reloads.
	if reloadParameters.Enabled {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				log.Info().Msg(color.HiMagentaString("[HOT RELOAD] Exiting..."))
				handleCommandTermination(cmd, cancelCtx)
				return
			case <-ticker.C:
				log.Debug().Msg(color.HiMagentaString("[HOT RELOAD] | Checking for environment updates..."))
				newEnv, newEtag, err := createInjectableEnvironment(
					reloadParameters.GetSecretsDetails,
					reloadParameters.ProjectConfigDir,
					reloadParameters.SecretOverriding,
					reloadParameters.ExpandSecrets,
					token,
				)
				if err != nil {
					log.Error().Err(err).Msg("[HOT RELOAD] | Failed to fetch new secrets")
					continue
				}

				if newEtag != reloadParameters.InitialETag {
					log.Info().Msg("[HOT RELOAD] Environment changed. Reloading application...")
					reloadParameters.InitialETag = newEtag
					env = newEnv
					secretsCount = len(newEnv)
					startCmd() // Restart the command with new environment
				} else {
					log.Debug().Msg("Not reloading because environments are identical")
				}
			}
		}
	}
}

func execCmd(cmd *exec.Cmd) error {
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start command: %v", err)
	}

	if err := cmd.Wait(); err != nil {
		return err // Return the raw error for more detailed handling in the caller
	}

	return nil
}

func execCommandWithReload(cmd *exec.Cmd, cancel context.CancelFunc) {
	err := execCmd(cmd)
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			if exitErr.ExitCode() == -1 {
				// This is hit when the command exits due to a reload signal.
				log.Debug().Msg(color.HiMagentaString("[HOT RELOAD] Process was terminated as part of reload, this is expected behavior"))
			} else {
				// This is hit when the command exits with an unexpected exit code.
				// This should stop the reload logic and exit the CLI.
				log.Error().Err(err).Msgf("[HOT RELOAD] Command execution failed with exit code: %d", exitErr.ExitCode())

				// ? Question: If the command throws an error, then the infisical CLI should terminate as well, right?
				cancel()
				util.PrintErrorAndExit(exitErr.ExitCode(), err, "[HOT RELOAD] Failed to start command")
			}
		} else {
			// This is hit due to generic errors, not exit errors. This is a catch-all for any other errors.
			cancel()
			util.HandleError(err, "[HOT RELOAD] Command execution failed")
		}
	} else {
		// If the command exits, the CLI should terminate as well
		log.Debug().Msg(color.HiMagentaString("Command exited without faults"))
		cancel()
		return
	}
}

func handleCommandTermination(cmd *exec.Cmd, cmdCancel context.CancelFunc) {

	{
		if cmd != nil && cmd.Process != nil {
			log.Info().Msg(color.HiMagentaString("[HOT RELOAD] Terminating existing process..."))
			if err := cmd.Process.Signal(syscall.SIGTERM); err != nil {
				log.Error().Err(err).Msg("[HOT RELOAD] Failed to terminate process")
				if err := cmd.Process.Kill(); err != nil {
					log.Error().Err(err).Msg("[HOT RELOAD] Failed to kill process")
				}
			}
			if cmdCancel != nil {
				cmdCancel()
			}
			// Wait for the process to finish
			_, err := cmd.Process.Wait()
			if err != nil {
				if err.Error() != "wait: no child processes" {
					log.Error().Err(err).Msg("[HOT RELOAD] Error waiting for process to terminate")
				}
			}
		}
	}
}

func createInjectableEnvironment(request models.GetAllSecretsParameters, projectConfigDir string, secretOverriding bool, shouldExpandSecrets bool, token *models.TokenDetails) ([]string, string, error) {

	secrets, err := util.GetAllEnvironmentVariables(request, projectConfigDir)

	if err != nil {
		return nil, "", err
	}

	if secretOverriding {
		secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_PERSONAL)
	} else {
		secrets = util.OverrideSecrets(secrets, util.SECRET_TYPE_SHARED)
	}

	if shouldExpandSecrets {

		authParams := models.ExpandSecretsAuthentication{}

		if token != nil && token.Type == util.SERVICE_TOKEN_IDENTIFIER {
			authParams.InfisicalToken = token.Token
		} else if token != nil && token.Type == util.UNIVERSAL_AUTH_TOKEN_IDENTIFIER {
			authParams.UniversalAuthAccessToken = token.Token
		}

		secrets = util.ExpandSecrets(secrets, authParams, projectConfigDir)
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

	// Create and sort the env slice using slices.SortFunc
	env := make([]string, 0, len(environmentVariables))
	for key, value := range environmentVariables {
		env = append(env, key+"="+value)
	}

	return env, util.GenerateETagFromSecrets(secrets), nil
}
