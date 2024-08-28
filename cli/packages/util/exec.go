package util

import (
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"

	"github.com/mattn/go-isatty"
)

func RunCommand(singleCommand string, args []string, env []string) (*exec.Cmd, error) {
	var c *exec.Cmd
	var err error

	if singleCommand != "" {
		c, err = RunCommandFromString(singleCommand, env)
	} else {
		c, err = RunCommandFromArgs(args, env)
	}

	return c, err
}

func IsProcessRunning(p *os.Process) bool {
	err := p.Signal(syscall.Signal(0))
	return err == nil
}

// For "infisical run -- COMMAND"
func RunCommandFromArgs(command []string, env []string) (*exec.Cmd, error) {
	cmd := exec.Command(command[0], command[1:]...)
	cmd.Env = env
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := execCommand(cmd)

	return cmd, err
}

func execCommand(cmd *exec.Cmd) error {

	shouldForward := !isatty.IsTerminal(os.Stdout.Fd())
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan)

	if err := cmd.Start(); err != nil {
		return err
	}

	// handle all signals
	go func() {
		for {
			if shouldForward {
				// forward to process
				sig := <-sigChan
				cmd.Process.Signal(sig)
			} else {
				<-sigChan
			}
		}
	}()

	return nil
}

// For "infisical run --command=COMMAND"
func RunCommandFromString(command string, env []string) (*exec.Cmd, error) {
	shell := [2]string{"sh", "-c"}
	if runtime.GOOS == "windows" {
		shell = [2]string{"cmd", "/C"}
	} else {
		// these shells all support the same options we use for sh
		shells := []string{"/bash", "/dash", "/fish", "/zsh", "/ksh", "/csh", "/tcsh"}
		envShell := os.Getenv("SHELL")
		for _, s := range shells {
			if strings.HasSuffix(envShell, s) {
				shell[0] = envShell
				break
			}
		}
	}
	cmd := exec.Command(shell[0], shell[1], command) // #nosec G204 nosemgrep: semgrep_configs.prohibit-exec-command
	cmd.Env = env
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := execCommand(cmd)
	return cmd, err
}
