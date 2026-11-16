package fn

import "strings"

// CanonicalSecretPath returns the path a folder lookup resolves to: one leading slash, no empty
// segments and no trailing slash, so "prod", "//prod" and "/prod/" all become "/prod".
func CanonicalSecretPath(path string) string {
	segments := strings.FieldsFunc(path, func(r rune) bool { return r == '/' })
	return "/" + strings.Join(segments, "/")
}
