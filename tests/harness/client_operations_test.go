package harness_test

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/infra"
)

// Every operation in include-operation-ids is generated whether or not a test uses it,
// so an id nothing calls is code in the client, and in every regeneration diff, for
// nothing.
func TestLayout_EveryGeneratedOperationIsUsed(t *testing.T) {
	root, err := infra.RepoRoot()
	if err != nil {
		t.Fatalf("finding the repository root: %v", err)
	}
	testsDir := filepath.Join(root, "tests")

	config, err := os.ReadFile(filepath.Join(testsDir, "clients", "api", "oapi-codegen.yaml"))
	if err != nil {
		t.Fatalf("reading the client config: %v", err)
	}
	ids := regexp.MustCompile(`(?m)^    - (\w+)$`).FindAllStringSubmatch(string(config), -1)
	if len(ids) == 0 {
		t.Fatal("found no include-operation-ids; the config is not being read")
	}

	identifiers := map[string]bool{}
	word := regexp.MustCompile(`\b[A-Z]\w*`)
	err = filepath.WalkDir(testsDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() && path == filepath.Join(testsDir, "clients") {
			return filepath.SkipDir
		}
		if d.IsDir() || !strings.HasSuffix(path, ".go") {
			return nil
		}
		src, err := os.ReadFile(path)
		for _, w := range word.FindAll(src, -1) {
			identifiers[string(w)] = true
		}
		return err
	})
	if err != nil {
		t.Fatalf("walking %s: %v", testsDir, err)
	}

	for _, id := range ids {
		name := strings.ToUpper(id[1][:1]) + id[1][1:]
		// The suffixes the generator puts after an operation's name. Listing them, rather
		// than accepting any, keeps createSecret from counting as used because
		// CreateSecretV4WithResponse is.
		generated := regexp.MustCompile(`^` + name + `(With\w*Response|Response|Params\w*|JSONBody\w*|(JSON|Formdata)RequestBody|\d{3}JSONResponseBody\w*)$`)
		if !anyMatch(identifiers, generated) {
			t.Errorf("%s is in include-operation-ids but no test uses it; remove it from clients/api/oapi-codegen.yaml", id[1])
		}
	}
}

func anyMatch(identifiers map[string]bool, re *regexp.Regexp) bool {
	for id := range identifiers {
		if re.MatchString(id) {
			return true
		}
	}
	return false
}
