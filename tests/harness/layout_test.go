package harness_test

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/infra"
)

// isolatedRoots are the only directories whose packages may use harness.Isolated. CI
// runs them one package at a time, after the shared suites, because each boots its own
// Postgres, Redis and Infisical; an Isolated package anywhere else would run alongside
// the shared stack and every other package, which is more than a CI runner can hold.
var isolatedRoots = []string{"suitesisolated", filepath.Join("harnesstest", "isolated")}

func TestLayout_IsolatedPackagesLiveInIsolatedRoots(t *testing.T) {
	root, err := infra.RepoRoot()
	if err != nil {
		t.Fatalf("finding the repository root: %v", err)
	}
	testsDir := filepath.Join(root, "tests")

	var isolated []string
	for _, dir := range []string{"suites", "suitesisolated", "harnesstest"} {
		err := filepath.WalkDir(filepath.Join(testsDir, dir), func(path string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() || d.Name() != "main_test.go" {
				return err
			}
			src, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			rel, _ := filepath.Rel(testsDir, filepath.Dir(path))
			inRoot := underAny(rel, isolatedRoots)
			usesIsolated := strings.Contains(string(src), "harness.Isolated")
			switch {
			case usesIsolated && !inRoot:
				t.Errorf("%s uses harness.Isolated; move it under tests/suitesisolated/", rel)
			case !usesIsolated && inRoot:
				t.Errorf("%s is under an isolated root but does not use harness.Isolated; move it under tests/suites/", rel)
			case usesIsolated:
				isolated = append(isolated, rel)
			}
			return nil
		})
		if err != nil {
			t.Fatalf("walking %s: %v", dir, err)
		}
	}
	if len(isolated) == 0 {
		t.Fatal("found no harness.Isolated package; the walk is not reading the suites")
	}
}

func underAny(rel string, roots []string) bool {
	for _, r := range roots {
		if rel == r || strings.HasPrefix(rel, r+string(filepath.Separator)) {
			return true
		}
	}
	return false
}
