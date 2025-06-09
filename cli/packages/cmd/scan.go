// MIT License

// Copyright (c) 2019 Zachary Rice

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

package cmd

import (
	_ "embed"
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/Infisical/infisical-merge/detect"
	"github.com/Infisical/infisical-merge/detect/cmd/scm"
	"github.com/Infisical/infisical-merge/detect/config"
	"github.com/Infisical/infisical-merge/detect/logging"
	"github.com/Infisical/infisical-merge/detect/report"
	"github.com/Infisical/infisical-merge/detect/sources"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/manifoldco/promptui"
	"github.com/posthog/posthog-go"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

const configDescription = `config file path
order of precedence:
1. --config flag
2. env var INFISICAL_SCAN_CONFIG
3. (--source/-s)/.infisical-scan.toml
If none of the three options are used, then Infisical will use the default scan config`

//go:embed pre-commit-script/pre-commit.sh
var preCommitTemplate []byte

//go:embed pre-commit-script/pre-commit-without-bang.sh
var preCommitTemplateAppend []byte

const (
	defaultHooksPath = ".git/hooks/"
	preCommitFile    = "pre-commit"
)

func init() {
	// scan flag for only scan command
	scanCmd.Flags().String("log-opts", "", "git log options")
	scanCmd.Flags().Bool("no-git", false, "treat git repo as a regular directory and scan those files, --log-opts has no effect on the scan when --no-git is set")
	scanCmd.Flags().Bool("pipe", false, "scan input from stdin, ex: `cat some_file | infisical scan --pipe`")
	scanCmd.Flags().Bool("follow-symlinks", false, "scan files that are symlinks to other files")

	// global scan flags
	scanCmd.PersistentFlags().StringP("config", "c", "", configDescription)
	scanCmd.PersistentFlags().Int("exit-code", 1, "exit code when leaks have been encountered")
	scanCmd.PersistentFlags().StringP("source", "s", ".", "path to source")
	scanCmd.PersistentFlags().StringP("report-path", "r", "", "report file")
	scanCmd.PersistentFlags().StringP("report-format", "f", "json", "output format (json, csv, sarif)")
	scanCmd.PersistentFlags().StringP("baseline-path", "b", "", "path to baseline with issues that can be ignored")
	scanCmd.PersistentFlags().BoolP("verbose", "v", false, "show verbose output from scan (which file, where in the file, what secret)")
	scanCmd.PersistentFlags().BoolP("no-color", "", false, "turn off color for verbose output")
	scanCmd.PersistentFlags().Int("max-target-megabytes", 0, "files larger than this will be skipped")
	scanCmd.PersistentFlags().Bool("redact", false, "redact secrets from logs and stdout")

	// scan git changes command flags
	scanGitChangesCmd.Flags().Bool("staged", false, "detect secrets in a --staged state")
	scanGitChangesCmd.Flags().String("log-opts", "", "git log options")

	// find config source
	err := viper.BindPFlag("config", scanCmd.PersistentFlags().Lookup("config"))
	if err != nil {
		log.Fatal().Msgf("err binding config %s", err.Error())
	}

	// add flags to main
	scanCmd.AddCommand(scanGitChangesCmd)
	rootCmd.AddCommand(scanCmd)

	installCmd.Flags().Bool("pre-commit-hook", false, "installs pre commit hook for Git repository")
	scanCmd.AddCommand(installCmd)
}

func initScanConfig(cmd *cobra.Command) {
	cfgPath, err := cmd.Flags().GetString("config")
	if err != nil {
		log.Fatal().Msg(err.Error())
	}

	if cfgPath != "" {
		viper.SetConfigFile(cfgPath)
		log.Debug().Msgf("using scan config %s from `--config`", cfgPath)
	} else if os.Getenv(config.DefaultScanConfigEnvName) != "" {
		envPath := os.Getenv(config.DefaultScanConfigEnvName)
		viper.SetConfigFile(envPath)
		log.Debug().Msgf("using scan config from %s env var: %s", config.DefaultScanConfigEnvName, envPath)
	} else {
		source, err := cmd.Flags().GetString("source")
		if err != nil {
			log.Fatal().Msg(err.Error())
		}
		fileInfo, err := os.Stat(source)
		if err != nil {
			log.Fatal().Msg(err.Error())
		}

		if !fileInfo.IsDir() {
			log.Debug().Msgf("unable to load scan config from %s since --source=%s is a file, using default config",
				filepath.Join(source, config.DefaultScanConfigFileName), source)
			viper.SetConfigType("toml")
			if err = viper.ReadConfig(strings.NewReader(config.DefaultConfig)); err != nil {
				log.Fatal().Msgf("err reading toml %s", err.Error())
			}
			return
		}

		if _, err := os.Stat(filepath.Join(source, config.DefaultScanConfigFileName)); os.IsNotExist(err) {
			log.Debug().Msgf("no scan config found in path %s, using default scan config", filepath.Join(source, config.DefaultScanConfigFileName))
			viper.SetConfigType("toml")
			if err = viper.ReadConfig(strings.NewReader(config.DefaultConfig)); err != nil {
				log.Fatal().Msgf("err reading default scan config toml %s", err.Error())
			}
			return
		} else {
			log.Debug().Msgf("using existing scan config %s from `(--source)/%s`", filepath.Join(source, config.DefaultScanConfigFileName), config.DefaultScanConfigFileName)
		}

		viper.AddConfigPath(source)
		viper.SetConfigName(config.DefaultScanConfigFileName)
		viper.SetConfigType("toml")
	}
	if err := viper.ReadInConfig(); err != nil {
		log.Fatal().Msgf("unable to load scan config, err: %s", err)
	}
}

var installCmd = &cobra.Command{
	Use:   "install",
	Short: "Install scanning scripts and tools. Use --help flag to see all options",
	Args:  cobra.ExactArgs(0),
	Run: func(cmd *cobra.Command, args []string) {
		installPrecommit := cmd.Flags().Changed("pre-commit-hook")
		if installPrecommit {
			hooksPath, err := getHooksPath()
			if err != nil {
				fmt.Printf("Error: %s\n", err)
				return
			}

			if hooksPath != ".git/hooks" {
				defaultHookOverride, err := overrideDefaultHooksPath(hooksPath)
				if err != nil {
					fmt.Printf("Error: %s\n", err)
				}

				if defaultHookOverride {
					ConfigureGitHooksPath()

					log.Info().Msgf("To switch back previous githooks manager run: git config core.hooksPath %s\n", hooksPath)
					return
				} else {
					log.Warn().Msgf("To automatically configure this hook, you need to switch the path of the Hooks. Alternatively, you can manually configure this hook by setting your pre-commit script to run command [infisical scan git-changes -v --staged].\n")
					return
				}
			}

			err = createOrUpdatePreCommitFile(hooksPath)
			if err != nil {
				fmt.Printf("Error: %s\n", err)
				return
			}

			log.Info().Msgf("Pre-commit hook successfully added. Infisical scan should now run on each commit you make\n")

			Telemetry.CaptureEvent("cli-command:install --pre-commit-hook", posthog.NewProperties().Set("version", util.CLI_VERSION))

			return
		}
	}}

var scanCmd = &cobra.Command{
	Use:   "scan",
	Short: "Scan for leaked secrets in git history, directories, and files",
	Run: func(cmd *cobra.Command, args []string) {
		initScanConfig(cmd)

		var (
			vc       config.ViperConfig
			findings []report.Finding
			err      error
		)

		// Load config
		if err = viper.Unmarshal(&vc); err != nil {
			log.Fatal().Err(err).Msg("Failed to load config")
		}
		cfg, err := vc.Translate()
		if err != nil {
			log.Fatal().Err(err).Msg("Failed to load config")
		}
		cfg.Path, _ = cmd.Flags().GetString("config")

		// start timer
		start := time.Now()

		// Setup detector
		detector := detect.NewDetector(cfg)
		detector.Config.Path, err = cmd.Flags().GetString("config")
		if err != nil {
			log.Fatal().Err(err).Msg("")
		}
		source, err := cmd.Flags().GetString("source")
		if err != nil {
			log.Fatal().Err(err).Msg("")
		}
		// if config path is not set, then use the {source}/.infisical-scan.toml path.
		// note that there may not be a `{source}/.infisical-scan.toml` file, this is ok.
		if detector.Config.Path == "" {
			detector.Config.Path = filepath.Join(source, config.DefaultScanConfigFileName)
		}
		// set verbose flag
		if detector.Verbose, err = cmd.Flags().GetBool("verbose"); err != nil {
			log.Fatal().Err(err).Msg("")
		}
		// set redact flag

		redactFlag, err := cmd.Flags().GetBool("redact")
		if err != nil {
			log.Fatal().Err(err).Msg("")
		}
		if redactFlag {
			detector.Redact = 100
		} else {
			detector.Redact = 0
		}

		if detector.MaxTargetMegaBytes, err = cmd.Flags().GetInt("max-target-megabytes"); err != nil {
			log.Fatal().Err(err).Msg("")
		}
		// set color flag
		if detector.NoColor, err = cmd.Flags().GetBool("no-color"); err != nil {
			log.Fatal().Err(err).Msg("")
		}

		if fileExists(filepath.Join(source, config.DefaultInfisicalIgnoreFineName)) {
			if err = detector.AddGitleaksIgnore(filepath.Join(source, config.DefaultInfisicalIgnoreFineName)); err != nil {
				log.Fatal().Err(err).Msg("could not call AddInfisicalIgnore")
			}
		}

		// ignore findings from the baseline (an existing report in json format generated earlier)
		baselinePath, _ := cmd.Flags().GetString("baseline-path")
		if baselinePath != "" {
			err = detector.AddBaseline(baselinePath, source)
			if err != nil {
				log.Error().Msgf("Could not load baseline. The path must point to report generated by `infisical scan` using the default format: %s", err)
			}
		}

		// set follow symlinks flag
		if detector.FollowSymlinks, err = cmd.Flags().GetBool("follow-symlinks"); err != nil {
			log.Fatal().Err(err).Msg("")
		}

		// set exit code
		exitCode, err := cmd.Flags().GetInt("exit-code")
		if err != nil {
			log.Fatal().Err(err).Msg("could not get exit code")
		}

		// determine what type of scan:
		// - git: scan the history of the repo
		// - no-git: scan files by treating the repo as a plain directory
		noGit, err := cmd.Flags().GetBool("no-git")
		if err != nil {
			log.Fatal().Err(err).Msg("could not call GetBool() for no-git")
		}
		fromPipe, err := cmd.Flags().GetBool("pipe")
		if err != nil {
			log.Fatal().Err(err)
		}

		log.Info().Msgf("scanning for exposed secrets...")

		// start the detector scan
		if noGit {
			paths, err := sources.DirectoryTargets(
				source,
				detector.Sema,
				detector.FollowSymlinks,
				detector.Config.Allowlists,
			)
			if err != nil {
				logging.Fatal().Err(err).Send()
			}

			if findings, err = detector.DetectFiles(paths); err != nil {
				// don't exit on error, just log it
				logging.Error().Err(err).Msg("failed scan directory")
			}
		} else if fromPipe {
			if findings, err = detector.DetectReader(os.Stdin, 10); err != nil {
				// log fatal to exit, no need to continue since a report
				// will not be generated when scanning from a pipe...for now
				logging.Fatal().Err(err).Msg("failed scan input from stdin")
			}
		} else {
			var (
				gitCmd      *sources.GitCmd
				scmPlatform scm.Platform
				remote      *detect.RemoteInfo
			)

			var logOpts string
			logOpts, err = cmd.Flags().GetString("log-opts")

			if gitCmd, err = sources.NewGitLogCmd(source, logOpts); err != nil {
				logging.Fatal().Err(err).Msg("could not create Git cmd")
			}
			if scmPlatform, err = scm.PlatformFromString("github"); err != nil {
				logging.Fatal().Err(err).Send()
			}
			remote = detect.NewRemoteInfo(scmPlatform, source)

			if findings, err = detector.DetectGit(gitCmd, remote); err != nil {
				// don't exit on error, just log it
				logging.Error().Err(err).Msg("failed to scan Git repository")
			}
		}
		// log info about the scan
		if err == nil {
			log.Info().Msgf("scan completed in %s", FormatDuration(time.Since(start)))
			if len(findings) != 0 {
				log.Warn().Msgf("leaks found: %d", len(findings))
			} else {
				log.Info().Msg("no leaks found")
			}
		} else {
			log.Warn().Msgf("partial scan completed in %s", FormatDuration(time.Since(start)))
			if len(findings) != 0 {
				log.Warn().Msgf("%d leaks found in partial scan", len(findings))
			} else {
				log.Warn().Msg("no leaks found in partial scan")
			}
		}

		Telemetry.CaptureEvent("cli-command:scan", posthog.NewProperties().Set("risks", len(findings)).Set("version", util.CLI_VERSION))

		// write report if desired
		reportPath, _ := cmd.Flags().GetString("report-path")
		ext, _ := cmd.Flags().GetString("report-format")
		if reportPath != "" {
			reportFindings(findings, reportPath, ext, &cfg)
		}

		if err != nil {
			os.Exit(1)
		}

		if len(findings) != 0 {
			os.Exit(exitCode)
		}
	},
}

var scanGitChangesCmd = &cobra.Command{
	Use:   "git-changes",
	Short: "Scan for secrets in uncommitted changes in a git repo",
	Run: func(cmd *cobra.Command, args []string) {
		initScanConfig(cmd)

		var vc config.ViperConfig

		if err := viper.Unmarshal(&vc); err != nil {
			log.Fatal().Err(err).Msg("Failed to load config")
		}
		cfg, err := vc.Translate()
		if err != nil {
			log.Fatal().Err(err).Msg("Failed to load config")
		}

		cfg.Path, _ = cmd.Flags().GetString("config")
		exitCode, _ := cmd.Flags().GetInt("exit-code")
		staged, _ := cmd.Flags().GetBool("staged")

		// Setup detector
		detector := detect.NewDetector(cfg)
		detector.Config.Path, err = cmd.Flags().GetString("config")
		if err != nil {
			log.Fatal().Err(err).Msg("")
		}
		source, err := cmd.Flags().GetString("source")
		if err != nil {
			log.Fatal().Err(err).Msg("")
		}
		// if config path is not set, then use the {source}/.infisical-scan.toml path.
		// note that there may not be a `{source}/.infisical-scan.toml` file, this is ok.
		if detector.Config.Path == "" {
			detector.Config.Path = filepath.Join(source, config.DefaultScanConfigFileName)
		}
		// set verbose flag
		if detector.Verbose, err = cmd.Flags().GetBool("verbose"); err != nil {
			log.Fatal().Err(err).Msg("")
		}
		// set redact flag

		redactFlag, err := cmd.Flags().GetBool("redact")
		if err != nil {
			log.Fatal().Err(err).Msg("")
		}
		if redactFlag {
			detector.Redact = 100
		} else {
			detector.Redact = 0
		}

		if detector.MaxTargetMegaBytes, err = cmd.Flags().GetInt("max-target-megabytes"); err != nil {
			log.Fatal().Err(err).Msg("")
		}
		// set color flag
		if detector.NoColor, err = cmd.Flags().GetBool("no-color"); err != nil {
			log.Fatal().Err(err).Msg("")
		}

		if fileExists(filepath.Join(source, config.DefaultInfisicalIgnoreFineName)) {
			if err = detector.AddGitleaksIgnore(filepath.Join(source, config.DefaultInfisicalIgnoreFineName)); err != nil {
				log.Fatal().Err(err).Msg("could not call AddInfisicalIgnore")
			}
		}

		// start git scan
		var (
			findings []report.Finding

			gitCmd *sources.GitCmd
			remote *detect.RemoteInfo
		)

		if gitCmd, err = sources.NewGitDiffCmd(source, staged); err != nil {
			logging.Fatal().Err(err).Msg("could not create Git diff cmd")
		}
		remote = &detect.RemoteInfo{Platform: scm.NoPlatform}

		if findings, err = detector.DetectGit(gitCmd, remote); err != nil {
			// don't exit on error, just log it
			logging.Error().Err(err).Msg("failed to scan Git repository")
		}

		Telemetry.CaptureEvent("cli-command:scan git-changes", posthog.NewProperties().Set("risks", len(findings)).Set("version", util.CLI_VERSION))

		reportPath, _ := cmd.Flags().GetString("report-path")
		ext, _ := cmd.Flags().GetString("report-format")
		if reportPath != "" {
			reportFindings(findings, reportPath, ext, &cfg)
		}
		if len(findings) != 0 {
			os.Exit(exitCode)
		}
	},
}

func reportFindings(findings []report.Finding, reportPath string, ext string, cfg *config.Config) {

	var reporter report.Reporter

	switch ext {
	case "csv":
		reporter = &report.CsvReporter{}
	case "json":
		reporter = &report.JsonReporter{}
	case "junit":
		reporter = &report.JunitReporter{}
	case "sarif":
		reporter = &report.SarifReporter{
			OrderedRules: cfg.GetOrderedRules(),
		}
	default:
		logging.Fatal().Msgf("unknown report format %s", ext)
	}

	file, err := os.Create(reportPath)
	if err != nil {
		log.Fatal().Err(err).Msg("could not create file")
	}

	if err := reporter.Write(file, findings); err != nil {
		log.Fatal().Err(err).Msg("could not write")
	}

}

func fileExists(fileName string) bool {
	// check for a .infisicalignore file
	info, err := os.Stat(fileName)
	if err != nil && !os.IsNotExist(err) {
		return false
	}

	if info != nil && err == nil {
		if !info.IsDir() {
			return true
		}
	}
	return false
}

func FormatDuration(d time.Duration) string {
	scale := 100 * time.Second
	// look for the max scale that is smaller than d
	for scale > d {
		scale = scale / 10
	}
	return d.Round(scale / 100).String()
}

func overrideDefaultHooksPath(managedHook string) (bool, error) {
	YES := "Yes"
	NO := "No"

	options := []string{YES, NO}
	optionsPrompt := promptui.Select{
		Label: fmt.Sprintf("Your hooks path is set to [%s] but needs to be [.git/hooks] for automatic configuration. Would you like to switch? ", managedHook),
		Items: options,
		Size:  2,
	}

	_, selectedOption, err := optionsPrompt.Run()
	if err != nil {
		return false, err
	}

	return selectedOption == YES, err
}

func ConfigureGitHooksPath() {
	cmd := exec.Command("git", "config", "core.hooksPath", ".git/hooks")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		log.Fatal().Msgf("Failed to configure git hooks path: %v", err)
	}
}

// GetGitRoot returns the root directory of the current Git repository.
func GetGitRoot() (string, error) {
	cmd := exec.Command("git", "rev-parse", "--show-toplevel")
	output, err := cmd.Output()

	if err != nil {
		return "", fmt.Errorf("failed to get git root directory: %w", err)
	}

	gitRoot := strings.TrimSpace(string(output)) // Remove any trailing newline
	return gitRoot, nil
}

func getHooksPath() (string, error) {
	out, err := exec.Command("git", "config", "core.hooksPath").Output()
	if err != nil {
		if len(out) == 0 {
			out = []byte(".git/hooks") // set the default hook
		} else {
			log.Error().Msgf("Failed to get Git hooks path: %s\nOutput: %s\n", err, out)
		}
	}

	hooksPath := strings.TrimSpace(string(out))
	return hooksPath, nil
}

func createOrUpdatePreCommitFile(hooksPath string) error {
	// File doesn't exist, create a new one
	rootGitRepoPath, err := GetGitRoot()
	if err != nil {
		return err
	}

	filePath := fmt.Sprintf("%s/%s/%s", rootGitRepoPath, hooksPath, preCommitFile)

	_, err = os.Stat(filePath)
	if err == nil {
		// File already exists, check if it contains the managed comments
		content, err := ioutil.ReadFile(filePath)
		if err != nil {
			return fmt.Errorf("failed to read pre-commit file: %s", err)
		}

		if strings.Contains(string(content), "# MANAGED BY INFISICAL CLI (Do not modify): START") &&
			strings.Contains(string(content), "# MANAGED BY INFISICAL CLI (Do not modify): END") {
			return nil
		}

		// File already exists, append the template content
		file, err := os.OpenFile(filePath, os.O_APPEND|os.O_WRONLY, 0755)
		if err != nil {
			return fmt.Errorf("failed to open pre-commit file: %s", err)
		}

		defer file.Close()

		_, err = file.Write(preCommitTemplateAppend)
		if err != nil {
			return fmt.Errorf("failed to append to pre-commit file: %s", err)
		}

	} else if os.IsNotExist(err) {
		err = os.WriteFile(filePath, preCommitTemplate, 0755)
		if err != nil {
			return fmt.Errorf("failed to create pre-commit file: %s", err)
		}
	} else {
		// Error occurred while checking file status
		return fmt.Errorf("failed to check pre-commit file status: %s", err)
	}

	return nil
}
