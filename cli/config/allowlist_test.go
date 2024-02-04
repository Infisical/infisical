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
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCommitAllowed(t *testing.T) {
	tests := []struct {
		allowlist     Allowlist
		commit        string
		commitAllowed bool
	}{
		{
			allowlist: Allowlist{
				Commits: []string{"commitA"},
			},
			commit:        "commitA",
			commitAllowed: true,
		},
		{
			allowlist: Allowlist{
				Commits: []string{"commitB"},
			},
			commit:        "commitA",
			commitAllowed: false,
		},
		{
			allowlist: Allowlist{
				Commits: []string{"commitB"},
			},
			commit:        "",
			commitAllowed: false,
		},
	}
	for _, tt := range tests {
		assert.Equal(t, tt.commitAllowed, tt.allowlist.CommitAllowed(tt.commit))
	}
}

func TestRegexAllowed(t *testing.T) {
	tests := []struct {
		allowlist    Allowlist
		secret       string
		regexAllowed bool
	}{
		{
			allowlist: Allowlist{
				Regexes: []*regexp.Regexp{regexp.MustCompile("matchthis")},
			},
			secret:       "a secret: matchthis, done",
			regexAllowed: true,
		},
		{
			allowlist: Allowlist{
				Regexes: []*regexp.Regexp{regexp.MustCompile("matchthis")},
			},
			secret:       "a secret",
			regexAllowed: false,
		},
	}
	for _, tt := range tests {
		assert.Equal(t, tt.regexAllowed, tt.allowlist.RegexAllowed(tt.secret))
	}
}

func TestPathAllowed(t *testing.T) {
	tests := []struct {
		allowlist   Allowlist
		path        string
		pathAllowed bool
	}{
		{
			allowlist: Allowlist{
				Paths: []*regexp.Regexp{regexp.MustCompile("path")},
			},
			path:        "a path",
			pathAllowed: true,
		},
		{
			allowlist: Allowlist{
				Paths: []*regexp.Regexp{regexp.MustCompile("path")},
			},
			path:        "a ???",
			pathAllowed: false,
		},
	}
	for _, tt := range tests {
		assert.Equal(t, tt.pathAllowed, tt.allowlist.PathAllowed(tt.path))
	}
}
