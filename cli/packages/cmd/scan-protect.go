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
	"time"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"github.com/Infisical/infisical-merge/config"
	"github.com/Infisical/infisical-merge/detect"
	"github.com/Infisical/infisical-merge/report"
)

func init() {
	protectCmd.Flags().Bool("staged", false, "detect secrets in a --staged state")
	protectCmd.Flags().String("log-opts", "", "git log options")

	protectCmd.Flags().StringP("config", "c", "", configDescription)
	protectCmd.Flags().Int("exit-code", 1, "exit code when leaks have been encountered")
	protectCmd.Flags().StringP("source", "s", ".", "path to source")
	protectCmd.Flags().StringP("report-path", "r", "", "report file")
	protectCmd.Flags().StringP("report-format", "f", "json", "output format (json, csv, sarif)")
	protectCmd.Flags().StringP("baseline-path", "b", "", "path to baseline with issues that can be ignored")
	protectCmd.Flags().BoolP("verbose", "v", false, "show verbose output from scan (which file, where in the file, what secret)")
	protectCmd.Flags().BoolP("no-color", "", false, "turn off color for verbose output")
	protectCmd.Flags().Int("max-target-megabytes", 0, "files larger than this will be skipped")
	protectCmd.Flags().Bool("redact", false, "redact secrets from logs and stdout")

	err := viper.BindPFlag("config", protectCmd.Flags().Lookup("config"))
	if err != nil {
		log.Fatal().Msgf("err binding config %s", err.Error())
	}

	// Hide the flag
	protectCmd.Flags().MarkHidden("config")

	rootCmd.AddCommand(protectCmd)
}

var protectCmd = &cobra.Command{
	Use:   "prevent",
	Short: "scan for secrets in uncommitted changes in a git repo",
	Run:   runProtect,
}

func runProtect(cmd *cobra.Command, args []string) {
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
	// if config path is not set, then use the {source}/.gitleaks.toml path.
	// note that there may not be a `{source}/.gitleaks.toml` file, this is ok.
	if detector.Config.Path == "" {
		detector.Config.Path = filepath.Join(source, ".gitleaks.toml")
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

	if fileExists(filepath.Join(source, ".infisicalignore")) {
		if err = detector.AddGitleaksIgnore(filepath.Join(source, ".infisicalignore")); err != nil {
			log.Fatal().Err(err).Msg("could not call AddInfisicalIgnore")
		}
	}

	// get log options for git scan
	logOpts, err := cmd.Flags().GetString("log-opts")
	if err != nil {
		log.Fatal().Err(err).Msg("")
	}

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
}
