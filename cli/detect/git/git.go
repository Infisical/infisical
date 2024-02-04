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

package git

import (
	"bufio"
	"io"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gitleaks/go-gitdiff/gitdiff"
	"github.com/rs/zerolog/log"
)

var ErrEncountered bool

// GitLog returns a channel of gitdiff.File objects from the
// git log -p command for the given source.
func GitLog(source string, logOpts string) (<-chan *gitdiff.File, error) {
	sourceClean := filepath.Clean(source)
	var cmd *exec.Cmd
	if logOpts != "" {
		args := []string{"-C", sourceClean, "log", "-p", "-U0"}
		args = append(args, strings.Split(logOpts, " ")...)
		cmd = exec.Command("git", args...)
	} else {
		cmd = exec.Command("git", "-C", sourceClean, "log", "-p", "-U0",
			"--full-history", "--all")
	}

	log.Debug().Msgf("executing: %s", cmd.String())

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}

	go listenForStdErr(stderr)

	if err := cmd.Start(); err != nil {
		return nil, err
	}
	// HACK: to avoid https://github.com/zricethezav/gitleaks/issues/722
	time.Sleep(50 * time.Millisecond)

	return gitdiff.Parse(cmd, stdout)
}

// GitDiff returns a channel of gitdiff.File objects from
// the git diff command for the given source.
func GitDiff(source string, staged bool) (<-chan *gitdiff.File, error) {
	sourceClean := filepath.Clean(source)
	var cmd *exec.Cmd
	cmd = exec.Command("git", "-C", sourceClean, "diff", "-U0", ".")
	if staged {
		cmd = exec.Command("git", "-C", sourceClean, "diff", "-U0",
			"--staged", ".")
	}
	log.Debug().Msgf("executing: %s", cmd.String())

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}

	go listenForStdErr(stderr)

	if err := cmd.Start(); err != nil {
		return nil, err
	}
	// HACK: to avoid https://github.com/zricethezav/gitleaks/issues/722
	time.Sleep(50 * time.Millisecond)

	return gitdiff.Parse(cmd, stdout)
}

// listenForStdErr listens for stderr output from git and prints it to stdout
// then exits with exit code 1
func listenForStdErr(stderr io.ReadCloser) {
	scanner := bufio.NewScanner(stderr)
	for scanner.Scan() {
		// if git throws one of the following errors:
		//
		//  exhaustive rename detection was skipped due to too many files.
		//  you may want to set your diff.renameLimit variable to at least
		//  (some large number) and retry the command.
		//
		//	inexact rename detection was skipped due to too many files.
		//  you may want to set your diff.renameLimit variable to at least
		//  (some large number) and retry the command.
		//
		// we skip exiting the program as git log -p/git diff will continue
		// to send data to stdout and finish executing. This next bit of
		// code prevents gitleaks from stopping mid scan if this error is
		// encountered
		if strings.Contains(scanner.Text(),
			"exhaustive rename detection was skipped") ||
			strings.Contains(scanner.Text(),
				"inexact rename detection was skipped") ||
			strings.Contains(scanner.Text(),
				"you may want to set your diff.renameLimit") {
			log.Warn().Msg(scanner.Text())
		} else {
			log.Error().Msgf("[git] %s", scanner.Text())

			// asynchronously set this error flag to true so that we can
			// capture a log message and exit with a non-zero exit code
			// This value should get set before the `git` command exits so it's
			// safe-ish, although I know I know, bad practice.
			ErrEncountered = true
		}
	}
}
