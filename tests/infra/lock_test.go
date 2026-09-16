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
		if err != nil {
			t.Fatalf("lock: %v", err)
		}
		defer release()

		path := os.Getenv("INFRA_LOCK_FILE")
		appendLine(t, path, "start "+strconv.Itoa(os.Getpid()))
		time.Sleep(50 * time.Millisecond)
		appendLine(t, path, "end "+strconv.Itoa(os.Getpid()))
		return
	}

	record := filepath(t)
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			cmd := exec.Command(os.Args[0], "-test.run", "^TestLock_SerializesAcrossProcesses$")
			cmd.Env = append(os.Environ(), "INFRA_LOCK_CHILD=1", "INFRA_LOCK_FILE="+record)
			if out, err := cmd.CombinedOutput(); err != nil {
				t.Errorf("child failed: %v\n%s", err, out)
			}
		}()
	}
	wg.Wait()

	lines := strings.Fields(strings.ReplaceAll(readFile(t, record), "\n", " "))
	depth := 0
	for i := 0; i < len(lines); i += 2 {
		switch lines[i] {
		case "start":
			depth++
			if depth > 1 {
				t.Fatalf("two processes held the lock at once:\n%s", readFile(t, record))
			}
		case "end":
			depth--
		}
	}
	if got := strings.Count(readFile(t, record), "start"); got != workers {
		t.Fatalf("expected %d critical sections, got %d", workers, got)
	}
}

func filepath(t *testing.T) string {
	t.Helper()
	f, err := os.CreateTemp("", "inf-locktest-*")
	if err != nil {
		t.Fatal(err)
	}
	name := f.Name()
	_ = f.Close()
	t.Cleanup(func() { _ = os.Remove(name) })
	return name
}

func appendLine(t *testing.T, path, line string) {
	t.Helper()
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = f.Close() }()
	if _, err := f.WriteString(line + "\n"); err != nil {
		t.Fatal(err)
	}
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}
