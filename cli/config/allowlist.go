// MIT License

// Copyright (c) 2019 Zachary Rice

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

package config

import (
	"regexp"
	"strings"
)

// Allowlist allows a rule to be ignored for specific
// regexes, paths, and/or commits
type Allowlist struct {
	// Short human readable description of the allowlist.
	Description string

	// Regexes is slice of content regular expressions that are allowed to be ignored.
	Regexes []*regexp.Regexp

	// RegexTarget
	RegexTarget string

	// Paths is a slice of path regular expressions that are allowed to be ignored.
	Paths []*regexp.Regexp

	// Commits is a slice of commit SHAs that are allowed to be ignored.
	Commits []string

	// StopWords is a slice of stop words that are allowed to be ignored.
	// This targets the _secret_, not the content of the regex match like the
	// Regexes slice.
	StopWords []string
}

// CommitAllowed returns true if the commit is allowed to be ignored.
func (a *Allowlist) CommitAllowed(c string) bool {
	if c == "" {
		return false
	}
	for _, commit := range a.Commits {
		if commit == c {
			return true
		}
	}
	return false
}

// PathAllowed returns true if the path is allowed to be ignored.
func (a *Allowlist) PathAllowed(path string) bool {
	return anyRegexMatch(path, a.Paths)
}

// RegexAllowed returns true if the regex is allowed to be ignored.
func (a *Allowlist) RegexAllowed(s string) bool {
	return anyRegexMatch(s, a.Regexes)
}

func (a *Allowlist) ContainsStopWord(s string) bool {
	s = strings.ToLower(s)
	for _, stopWord := range a.StopWords {
		if strings.Contains(s, strings.ToLower(stopWord)) {
			return true
		}
	}
	return false
}
