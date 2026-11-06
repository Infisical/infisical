package infra

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

// Lock serializes an operation across processes, keyed by name.
//
// Two races need it, and both are invisible until they bite:
//
//   - Four test binaries start at once, all find no container of a given name, and
//     all try to create it. Reuse-by-name races here.
//   - The same four all find no image for the current source tree and all start
//     `docker build` on the same context.
//
// Returns a release function. Safe to call the release more than once.
func Lock(name string) (func(), error) {
	path := filepath.Join(os.TempDir(), Prefix+"-"+Sanitize(name)+".lock")

	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return nil, fmt.Errorf("infra: opening lock %s: %w", path, err)
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		_ = f.Close()
		return nil, fmt.Errorf("infra: acquiring lock %s: %w", path, err)
	}

	released := false
	return func() {
		if released {
			return
		}
		released = true
		_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
		_ = f.Close()
	}, nil
}
