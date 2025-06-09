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

package sources

import (
	"bufio"
	"errors"
	"io"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/gitleaks/go-gitdiff/gitdiff"

	"github.com/Infisical/infisical-merge/detect/logging"
)

var quotedOptPattern = regexp.MustCompile(`^(?:"[^"]+"|'[^']+')$`)

// GitCmd helps to work with Git's output.
type GitCmd struct {
	cmd         *exec.Cmd
	diffFilesCh <-chan *gitdiff.File
	errCh       <-chan error
}

// NewGitLogCmd returns `*DiffFilesCmd` with two channels: `<-chan *gitdiff.File` and `<-chan error`.
// Caller should read everything from channels until receiving a signal about their closure and call
// the `func (*DiffFilesCmd) Wait()` error in order to release resources.
func NewGitLogCmd(source string, logOpts string) (*GitCmd, error) {
	sourceClean := filepath.Clean(source)
	var cmd *exec.Cmd
	if logOpts != "" {
		args := []string{"-C", sourceClean, "log", "-p", "-U0"}

		// Ensure that the user-provided |logOpts| aren't wrapped in quotes.
		// https://github.com/gitleaks/gitleaks/issues/1153
		userArgs := strings.Split(logOpts, " ")
		var quotedOpts []string
		for _, element := range userArgs {
			if quotedOptPattern.MatchString(element) {
				quotedOpts = append(quotedOpts, element)
			}
		}
		if len(quotedOpts) > 0 {
			logging.Warn().Msgf("the following `--log-opts` values may not work as expected: %v\n\tsee https://github.com/gitleaks/gitleaks/issues/1153 for more information", quotedOpts)
		}

		args = append(args, userArgs...)
		cmd = exec.Command("git", args...)
	} else {
		cmd = exec.Command("git", "-C", sourceClean, "log", "-p", "-U0",
			"--full-history", "--all")
	}

	logging.Debug().Msgf("executing: %s", cmd.String())

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	errCh := make(chan error)
	go listenForStdErr(stderr, errCh)

	gitdiffFiles, err := gitdiff.Parse(stdout)
	if err != nil {
		return nil, err
	}

	return &GitCmd{
		cmd:         cmd,
		diffFilesCh: gitdiffFiles,
		errCh:       errCh,
	}, nil
}

// NewGitDiffCmd returns `*DiffFilesCmd` with two channels: `<-chan *gitdiff.File` and `<-chan error`.
// Caller should read everything from channels until receiving a signal about their closure and call
// the `func (*DiffFilesCmd) Wait()` error in order to release resources.
func NewGitDiffCmd(source string, staged bool) (*GitCmd, error) {
	sourceClean := filepath.Clean(source)
	var cmd *exec.Cmd
	cmd = exec.Command("git", "-C", sourceClean, "diff", "-U0", "--no-ext-diff", ".")
	if staged {
		cmd = exec.Command("git", "-C", sourceClean, "diff", "-U0", "--no-ext-diff",
			"--staged", ".")
	}
	logging.Debug().Msgf("executing: %s", cmd.String())

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	errCh := make(chan error)
	go listenForStdErr(stderr, errCh)

	gitdiffFiles, err := gitdiff.Parse(stdout)
	if err != nil {
		return nil, err
	}

	return &GitCmd{
		cmd:         cmd,
		diffFilesCh: gitdiffFiles,
		errCh:       errCh,
	}, nil
}

// DiffFilesCh returns a channel with *gitdiff.File.
func (c *GitCmd) DiffFilesCh() <-chan *gitdiff.File {
	return c.diffFilesCh
}

// ErrCh returns a channel that could produce an error if there is something in stderr.
func (c *GitCmd) ErrCh() <-chan error {
	return c.errCh
}

// Wait waits for the command to exit and waits for any copying to
// stdin or copying from stdout or stderr to complete.
//
// Wait also closes underlying stdout and stderr.
func (c *GitCmd) Wait() (err error) {
	return c.cmd.Wait()
}

// listenForStdErr listens for stderr output from git, prints it to stdout,
// sends to errCh and closes it.
func listenForStdErr(stderr io.ReadCloser, errCh chan<- error) {
	defer close(errCh)

	var errEncountered bool

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
		//  Auto packing the repository in background for optimum performance.
		//  See "git help gc" for manual housekeeping.
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
				"you may want to set your diff.renameLimit") ||
			strings.Contains(scanner.Text(),
				"See \"git help gc\" for manual housekeeping") ||
			strings.Contains(scanner.Text(),
				"Auto packing the repository in background for optimum performance") {
			logging.Warn().Msg(scanner.Text())
		} else {
			logging.Error().Msgf("[git] %s", scanner.Text())
			errEncountered = true
		}
	}

	if errEncountered {
		errCh <- errors.New("stderr is not empty")
		return
	}
}
