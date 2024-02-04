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

package report

import (
	"strings"
)

// Finding contains information about strings that
// have been captured by a tree-sitter query.
type Finding struct {
	Description string
	StartLine   int
	EndLine     int
	StartColumn int
	EndColumn   int

	Line string `json:"-"`

	Match string

	// Secret contains the full content of what is matched in
	// the tree-sitter query.
	Secret string

	// File is the name of the file containing the finding
	File        string
	SymlinkFile string
	Commit      string

	// Entropy is the shannon entropy of Value
	Entropy float32

	Author  string
	Email   string
	Date    string
	Message string
	Tags    []string

	// Rule is the name of the rule that was matched
	RuleID string

	// unique identifer
	Fingerprint string
}

// Redact removes sensitive information from a finding.
func (f *Finding) Redact() {
	f.Line = strings.Replace(f.Line, f.Secret, "REDACTED", -1)
	f.Match = strings.Replace(f.Match, f.Secret, "REDACTED", -1)
	f.Secret = "REDACTED"
}
