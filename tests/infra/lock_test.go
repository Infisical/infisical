package infra_test

import (
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestLock_SerializesAcrossProcesses(t *testing.T) {
	spec.Why(t, `The race this guards is between separate test binaries, so a same-process
		mutex test would pass while the real thing stayed broken. This re-execs itself to
		get genuinely separate processes.`)

	const workers = 4

	if os.Getenv("INFRA_LOCK_CHILD") != "" {
		// Child: hold the lock briefly and append a start/end pair. Overlapping
		// pairs in the file mean the lock did not hold.
		release, err := infra.Lock("locktest")
		require.NoError(t, err)
		defer release()

		path := os.Getenv("INFRA_LOCK_FILE")
		appendLine(t, path, "start "+strconv.Itoa(os.Getpid()))
		time.Sleep(50 * time.Millisecond)
		appendLine(t, path, "end "+strconv.Itoa(os.Getpid()))
		return
	}

	// Setup
	record := filepath(t)

	// Action
	var wg sync.WaitGroup
	failures := make(chan string, workers)
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			cmd := exec.Command(os.Args[0], "-test.run", "^TestLock_SerializesAcrossProcesses$")
			cmd.Env = append(os.Environ(), "INFRA_LOCK_CHILD=1", "INFRA_LOCK_FILE="+record)
			if out, err := cmd.CombinedOutput(); err != nil {
				failures <- err.Error() + "\n" + string(out)
			}
		}()
	}
	wg.Wait()
	close(failures)

	// Assert
	for f := range failures {
		require.Fail(t, "a child process failed", f)
	}
	lines := strings.Fields(strings.ReplaceAll(readFile(t, record), "\n", " "))
	depth := 0
	for i := 0; i < len(lines); i += 2 {
		switch lines[i] {
		case "start":
			depth++
			require.LessOrEqualf(t, depth, 1, "two processes held the lock at once:\n%s", readFile(t, record))
		case "end":
			depth--
		}
	}
	require.Equal(t, workers, strings.Count(readFile(t, record), "start"))
}

func filepath(t *testing.T) string {
	t.Helper()
	f, err := os.CreateTemp("", "inf-locktest-*")
	require.NoError(t, err)
	name := f.Name()
	_ = f.Close()
	t.Cleanup(func() { _ = os.Remove(name) })
	return name
}

func appendLine(t *testing.T, path, line string) {
	t.Helper()
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
	require.NoError(t, err)
	defer func() { _ = f.Close() }()
	_, err = f.WriteString(line + "\n")
	require.NoError(t, err)
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	require.NoError(t, err)
	return string(b)
}
