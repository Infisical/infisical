package infra

import (
	"fmt"
	"os"
	"time"
)

// Logger writes the lifecycle lines. One line per container decision, always on,
// because "why did that take four minutes" should need no investigation.
type Logger interface {
	Decision(action, name string, e Endpoint, took time.Duration, note string)
	Infof(format string, args ...any)
}

type stderrLogger struct{}

// NewLogger returns the default stderr logger.
func NewLogger() Logger { return stderrLogger{} }

func (stderrLogger) Decision(action, name string, e Endpoint, took time.Duration, note string) {
	line := fmt.Sprintf("infra: %-6s %-40s %s", action, name, e.HostPort())
	if took > 0 {
		line += fmt.Sprintf("  %.1fs", took.Seconds())
	}
	if note != "" {
		line += "  " + note
	}
	fmt.Fprintln(os.Stderr, line)
}

func (stderrLogger) Infof(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "infra: "+format+"\n", args...)
}
