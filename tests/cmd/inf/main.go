// Command inf manages the containers the blackbox harness leaves running.
//
// Shared containers deliberately outlive a `go test` run, so a second run adopts
// them and is fast. Reaping is therefore explicit rather than automatic.
package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra"
)

func main() {
	cmd := ""
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}

	switch cmd {
	case "up":
		os.Exit(up())
	case "status":
		os.Exit(status())
	case "down":
		os.Exit(down())
	default:
		fmt.Fprintln(os.Stderr, strings.TrimSpace(`
inf up       start the shared stack, so a test run adopts it instead of creating it
inf status   list harness containers, with the checkout that created each
inf down     stop every harness container and remove the network
`))
		os.Exit(2)
	}
}

// up pre-warms the shared stack.
//
// Not required: a test binary creates what it needs if nothing is there. Running it
// first means the binaries in one `go test ./...` adopt a single instance rather than
// racing to create it, and it keeps the image build and the 540-migration boot out of
// the first package's timing.
func up() int {
	if err := harness.Up(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return status()
}

func status() int {
	out, err := docker("ps", "-a",
		"--filter", "label="+infra.LabelScope,
		"--format", "{{.Names}}\t{{.State}}\t{{.Label \""+infra.LabelWorkspace+"\"}}")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if strings.TrimSpace(out) == "" {
		fmt.Println("no harness containers")
		return 0
	}
	fmt.Printf("%-52s %-10s %s\n", "NAME", "STATE", "WORKSPACE")
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		f := strings.SplitN(line, "\t", 3)
		for len(f) < 3 {
			f = append(f, "")
		}
		fmt.Printf("%-52s %-10s %s\n", f[0], f[1], f[2])
	}
	return 0
}

// down reaps by label rather than by name, so it works when a run was killed and
// left nothing behind to read.
//
// It is machine-wide on purpose: shared containers are shared across worktrees, so
// this can stop a run in another checkout. `inf status` shows which one created what.
func down() int {
	ids, err := docker("ps", "-aq", "--filter", "label="+infra.LabelScope)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if list := strings.Fields(ids); len(list) > 0 {
		if _, err := docker(append([]string{"rm", "-f"}, list...)...); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		fmt.Printf("removed %d container(s)\n", len(list))
	}
	if _, err := docker("network", "rm", infra.NetworkName); err == nil {
		fmt.Println("removed network " + infra.NetworkName)
	}
	return 0
}

func docker(args ...string) (string, error) {
	out, err := exec.Command("docker", args...).CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("docker %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}
