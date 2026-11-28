// Package zonefile reads the zone file forms DNS provider APIs take: absolute names and
// quoted TXT strings.
package zonefile

import "strings"

// Absolute is name with the trailing dot of an absolute name.
func Absolute(name string) string {
	if strings.HasSuffix(name, ".") {
		return name
	}
	return name + "."
}

// Unquote is what DNS serves for a TXT record in zone file form: its quoted strings
// joined.
func Unquote(content string) string {
	var b strings.Builder
	for i, part := range strings.Split(content, `"`) {
		if i%2 == 1 {
			b.WriteString(part)
		}
	}
	return b.String()
}
