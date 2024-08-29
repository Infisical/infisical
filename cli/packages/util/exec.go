package util

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
)

func RunCommand(singleCommand string, args []string, env []string, waitForExit bool) (*exec.Cmd, error) {
	var c *exec.Cmd
	var err error

	if singleCommand != "" {
		c, err = RunCommandFromString(singleCommand, env, waitForExit)
	} else {
		c, err = RunCommandFromArgs(args, env, waitForExit)
	}

	return c, err
}

func IsProcessRunning(p *os.Process) bool {
	err := p.Signal(syscall.Signal(0))
	return err == nil
}

// For "infisical run -- COMMAND"
func RunCommandFromArgs(args []string, env []string, waitForExit bool) (*exec.Cmd, error) {
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = env

	err := execCommand(cmd, waitForExit)

	return cmd, err
}

func execCommand(cmd *exec.Cmd, waitForExit bool) error {
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

	if !waitForExit {
		return nil
	}

	if err := cmd.Wait(); err != nil {
		_ = cmd.Process.Signal(os.Kill)
		return fmt.Errorf("failed to wait for command termination: %v", err)
	}

	waitStatus := cmd.ProcessState.Sys().(syscall.WaitStatus)
	os.Exit(waitStatus.ExitStatus())
	return nil
}

// For "infisical run --command=COMMAND"
func RunCommandFromString(command string, env []string, waitForExit bool) (*exec.Cmd, error) {
	shell := [2]string{"sh", "-c"}
	if runtime.GOOS == "windows" {
		shell = [2]string{"cmd", "/C"}
	} else {
		currentShell := os.Getenv("SHELL")
		if currentShell != "" {
			shell[0] = currentShell
		}
	}

	cmd := exec.Command(shell[0], shell[1], command) // #nosec G204 nosemgrep: semgrep_configs.prohibit-exec-command
	cmd.Env = env
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := execCommand(cmd, waitForExit)
	return cmd, err
}
