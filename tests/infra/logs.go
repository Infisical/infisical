package infra

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/testcontainers/testcontainers-go"
)

// LogDir is where container output is written, relative to the tests module.
const LogDir = ".logs"

// tailLines is how much output an error carries. Enough to show the actual failure
// without burying the assertion that follows it.
const tailLines = 30

// logSink captures a container's output.
//
// Attached at container start rather than read on demand, because a container that
// fails its wait strategy is torn down before anyone can call Logs() on it. That is
// the worst failure the harness can produce: a five minute boot that ends in
// "context deadline exceeded" with nothing about why.
//
// Output is written to a file unconditionally, so a hanging container can be tailed
// live, and the last few lines are kept in memory for the error message.
type logSink struct {
	mu   sync.Mutex
	file *os.File
	tail []string
	path string
}

func newLogSink(runID, name string) *logSink {
	s := &logSink{}

	dir := filepath.Join(LogDir, runID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		// Capture is a diagnostic aid, never a reason a test cannot run.
		return s
	}
	path := filepath.Join(dir, Sanitize(name)+".log")
	f, err := os.Create(path)
	if err != nil {
		return s
	}
	s.file, s.path = f, path
	return s
}

// Accept implements testcontainers.LogConsumer.
func (s *logSink) Accept(l testcontainers.Log) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.file != nil {
		_, _ = s.file.Write(l.Content)
	}
	for _, line := range strings.Split(strings.TrimRight(string(l.Content), "\n"), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		s.tail = append(s.tail, line)
	}
	if len(s.tail) > tailLines {
		s.tail = s.tail[len(s.tail)-tailLines:]
	}
}

// Tail is the captured output, for an error message.
func (s *logSink) Tail() string {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.tail) == 0 {
		return "(no output)"
	}
	return strings.Join(s.tail, "\n")
}

// Path is where the full output was written, empty when capture failed.
func (s *logSink) Path() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.path
}

func (s *logSink) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.file != nil {
		_ = s.file.Close()
	}
}

// startFailure renders a container that never came up, with the evidence attached.
func startFailure(name, image string, sink *logSink, err error) error {
	msg := fmt.Sprintf("infra: %s (%s) never became ready: %v", name, image, err)
	if p := sink.Path(); p != "" {
		msg += fmt.Sprintf("\nfull output: %s", p)
	}
	return fmt.Errorf("%s\nlast output:\n%s", msg, indent(sink.Tail()))
}

func indent(s string) string {
	lines := strings.Split(s, "\n")
	for i, l := range lines {
		lines[i] = "    " + l
	}
	return strings.Join(lines, "\n")
}
