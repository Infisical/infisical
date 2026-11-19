package infra

import (
	"fmt"
	"os"
	"path/filepath"
)

func RepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "backend", "Dockerfile")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("infra: no backend/Dockerfile found above the working directory")
		}
		dir = parent
	}
}
