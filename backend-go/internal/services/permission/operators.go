package permission

import (
	"strings"

	"github.com/bmatcuk/doublestar/v4"
	"github.com/infisical/gocasl"
)

// opGlob implements the $glob operator for path matching.
// Port of the picomatch-based $glob from Node.js (backend/src/lib/casl/index.ts).
// Uses doublestar for glob matching which supports ** patterns like picomatch.
func opGlob(fieldValue, constraint any) bool {
	val, ok := fieldValue.(string)
	pattern, ok2 := constraint.(string)
	if !ok || !ok2 {
		return false
	}

	if strings.TrimSpace(pattern) == "" {
		return false
	}

	// doublestar.Match handles *, **, ?, and character classes.
	matched, _ := doublestar.Match(pattern, val)

	return matched
}

// PermissionFieldOps returns the default gocasl field operators extended with the custom $glob operator.
func PermissionFieldOps() gocasl.FieldOps {
	return gocasl.DefaultFieldOps().With("$glob", gocasl.Compare(opGlob))
}
