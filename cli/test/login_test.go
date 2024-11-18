package tests

import (
	"log"
	"os/exec"
	"strings"
	"testing"

	"github.com/creack/pty"
	"github.com/stretchr/testify/assert"
)

func UserInitCmd() {
	c := exec.Command(FORMATTED_CLI_NAME, "init")
	ptmx, err := pty.Start(c)
	if err != nil {
		log.Fatalf("error running CLI command: %v", err)
    }
 	defer func() { _ = ptmx.Close() }()

	stepChan := make(chan int, 10)

	go func() {
		buf := make([]byte, 1024)
		step := -1
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				terminalOut := string(buf)
				if strings.Contains(terminalOut, "Which Infisical organization would you like to select a project from?") && step < 0  {
					step += 1
					stepChan <- step
				} else if strings.Contains(terminalOut, "Which of your Infisical projects would you like to connect this project to?") && step < 1 {
					step += 1;
					stepChan <- step
				}
			}
			if err != nil {
				close(stepChan)
				return
			}
		}
	}()

	for i := range stepChan {
		switch i {
		case 0: 
			ptmx.Write([]byte("\n"))
		case 1:
			ptmx.Write([]byte("\n"))
		}
	}
}

func UserLoginCmd() {
	// set vault to file because CI has no keyring
	vaultCmd := exec.Command(FORMATTED_CLI_NAME, "vault", "set", "file")
	_, err := vaultCmd.Output()
	if err != nil {
		log.Fatalf("error setting vault: %v", err)
	}

	// Start programmatic interaction with CLI
	c := exec.Command(FORMATTED_CLI_NAME, "login", "--interactive")
	ptmx, err := pty.Start(c)
	if err != nil {
		log.Fatalf("error running CLI command: %v", err)
    }
 	defer func() { _ = ptmx.Close() }()

	stepChan := make(chan int, 10)

	go func() {
		buf := make([]byte, 1024)
		step := -1
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				terminalOut := string(buf)
				if strings.Contains(terminalOut, "Infisical Cloud") && step < 0 {
					step += 1;
					stepChan <- step
				} else if strings.Contains(terminalOut, "Email") && step < 1 {
					step += 1;
					stepChan <- step
				} else if strings.Contains(terminalOut, "Password") && step < 2 {
					step += 1;
					stepChan <- step
				} else if strings.Contains(terminalOut, "Infisical organization") && step < 3 {
					step += 1;
					stepChan <- step
				} else if strings.Contains(terminalOut, "Enter passphrase") && step < 4 {
					step += 1;
					stepChan <- step
				}
			}
			if err != nil {
				close(stepChan)
				return
			}
		}
	}()

	for i := range stepChan {
		switch i {
		case 0:
			ptmx.Write([]byte("\n"))
		case 1:
			ptmx.Write([]byte(creds.UserEmail))
			ptmx.Write([]byte("\n"))
		case 2:
			ptmx.Write([]byte(creds.UserPassword))
			ptmx.Write([]byte("\n"))
		case 3:
			ptmx.Write([]byte("\n"))
		}
	}

}

func MachineIdentityLoginCmd(t *testing.T) {
	if creds.UAAccessToken != "" {
		return
	}

	jwtPattern := `^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$`

	output, err := ExecuteCliCommand(FORMATTED_CLI_NAME, "login", "--method=universal-auth", "--client-id", creds.ClientID, "--client-secret", creds.ClientSecret, "--plain", "--silent")

	if err != nil {
		t.Fatalf("error running CLI command: %v", err)
	}

	assert.Regexp(t, jwtPattern, output)

	creds.UAAccessToken = output

	// We can't use snapshot testing here because the output will be different every time
}
