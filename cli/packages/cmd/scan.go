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
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Infisical/infisical-merge/config"
	"github.com/Infisical/infisical-merge/detect"
	"github.com/Infisical/infisical-merge/report"
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
		if detector.Redact, err = cmd.Flags().GetBool("redact"); err != nil {
			log.Fatal().Err(err).Msg("")
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
			findings, err = detector.DetectFiles(source)
			if err != nil {
				// don't exit on error, just log it
				log.Error().Err(err).Msg("")
			}
		} else if fromPipe {
			findings, err = detector.DetectReader(os.Stdin, 10)
			if err != nil {
				// log fatal to exit, no need to continue since a report
				// will not be generated when scanning from a pipe...for now
				log.Fatal().Err(err).Msg("")
			}
		} else {
			var logOpts string
			logOpts, err = cmd.Flags().GetString("log-opts")
			if err != nil {
				log.Fatal().Err(err).Msg("")
			}
			findings, err = detector.DetectGit(source, logOpts, detect.DetectType)
			if err != nil {
				// don't exit on error, just log it
				log.Error().Err(err).Msg("")
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

		// write report if desired
		reportPath, _ := cmd.Flags().GetString("report-path")
		ext, _ := cmd.Flags().GetString("report-format")
		if reportPath != "" {
			if err := report.Write(findings, cfg, ext, reportPath); err != nil {
				log.Fatal().Err(err).Msg("could not write")
			}
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
		if detector.Redact, err = cmd.Flags().GetBool("redact"); err != nil {
			log.Fatal().Err(err).Msg("")
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

		// get log options for git scan
		logOpts, err := cmd.Flags().GetString("log-opts")
		if err != nil {
			log.Fatal().Err(err).Msg("")
		}

		log.Info().Msgf("scanning for exposed secrets...")

		// start git scan
		var findings []report.Finding
		if staged {
			findings, err = detector.DetectGit(source, logOpts, detect.ProtectStagedType)
		} else {
			findings, err = detector.DetectGit(source, logOpts, detect.ProtectType)
		}
		if err != nil {
			// don't exit on error, just log it
			log.Error().Err(err).Msg("")
		}

		// log info about the scan
		log.Info().Msgf("scan completed in %s", FormatDuration(time.Since(start)))
		if len(findings) != 0 {
			log.Warn().Msgf("leaks found: %d", len(findings))
		} else {
			log.Info().Msg("no leaks found")
		}

		reportPath, _ := cmd.Flags().GetString("report-path")
		ext, _ := cmd.Flags().GetString("report-format")
		if reportPath != "" {
			if err = report.Write(findings, cfg, ext, reportPath); err != nil {
				log.Fatal().Err(err).Msg("")
			}
		}
		if len(findings) != 0 {
			os.Exit(exitCode)
		}
	},
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
