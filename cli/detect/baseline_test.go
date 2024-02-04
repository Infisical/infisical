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

package detect

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/Infisical/infisical-merge/report"
)

func TestIsNew(t *testing.T) {
	tests := []struct {
		findings report.Finding
		baseline []report.Finding
		expect   bool
	}{
		{
			findings: report.Finding{
				Author: "a",
				Commit: "0000",
			},
			baseline: []report.Finding{
				{
					Author: "a",
					Commit: "0000",
				},
			},
			expect: false,
		},
		{
			findings: report.Finding{
				Author: "a",
				Commit: "0000",
			},
			baseline: []report.Finding{
				{
					Author: "a",
					Commit: "0002",
				},
			},
			expect: true,
		},
		{
			findings: report.Finding{
				Author: "a",
				Commit: "0000",
				Tags:   []string{"a", "b"},
			},
			baseline: []report.Finding{
				{
					Author: "a",
					Commit: "0000",
					Tags:   []string{"a", "c"},
				},
			},
			expect: false, // Updated tags doesn't make it a new finding
		},
	}
	for _, test := range tests {
		assert.Equal(t, test.expect, IsNew(test.findings, test.baseline))
	}
}

func TestFileLoadBaseline(t *testing.T) {
	tests := []struct {
		Filename      string
		ExpectedError error
	}{
		{
			Filename:      "../testdata/baseline/baseline.csv",
			ExpectedError: errors.New("the format of the file ../testdata/baseline/baseline.csv is not supported"),
		},
		{
			Filename:      "../testdata/baseline/baseline.sarif",
			ExpectedError: errors.New("the format of the file ../testdata/baseline/baseline.sarif is not supported"),
		},
		{
			Filename:      "../testdata/baseline/notfound.json",
			ExpectedError: errors.New("could not open ../testdata/baseline/notfound.json"),
		},
	}

	for _, test := range tests {
		_, err := LoadBaseline(test.Filename)
		assert.Equal(t, test.ExpectedError.Error(), err.Error())
	}
}

func TestIgnoreIssuesInBaseline(t *testing.T) {
	tests := []struct {
		findings    []report.Finding
		baseline    []report.Finding
		expectCount int
	}{
		{
			findings: []report.Finding{
				{
					Author: "a",
					Commit: "5",
				},
			},
			baseline: []report.Finding{
				{
					Author: "a",
					Commit: "5",
				},
			},
			expectCount: 0,
		},
		{
			findings: []report.Finding{
				{
					Author:      "a",
					Commit:      "5",
					Fingerprint: "a",
				},
			},
			baseline: []report.Finding{
				{
					Author:      "a",
					Commit:      "5",
					Fingerprint: "b",
				},
			},
			expectCount: 0,
		},
	}

	for _, test := range tests {
		d, _ := NewDetectorDefaultConfig()
		d.baseline = test.baseline
		for _, finding := range test.findings {
			d.addFinding(finding)
		}
		assert.Equal(t, test.expectCount, len(d.findings))
	}
}
