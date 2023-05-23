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
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/Infisical/infisical-merge/config"
)

const (
	expectPath = "../testdata/expected/"
	tmpPath    = "../testdata/tmp"
)

func TestReport(t *testing.T) {
	tests := []struct {
		findings  []Finding
		ext       string
		wantEmpty bool
	}{
		{
			ext: "json",
			findings: []Finding{
				{
					RuleID: "test-rule",
				},
			},
		},
		{
			ext: ".json",
			findings: []Finding{
				{
					RuleID: "test-rule",
				},
			},
		},
		{
			ext: ".jsonj",
			findings: []Finding{
				{
					RuleID: "test-rule",
				},
			},
			wantEmpty: true,
		},
		{
			ext: ".csv",
			findings: []Finding{
				{
					RuleID: "test-rule",
				},
			},
		},
		{
			ext: "csv",
			findings: []Finding{
				{
					RuleID: "test-rule",
				},
			},
		},
		{
			ext: "CSV",
			findings: []Finding{
				{
					RuleID: "test-rule",
				},
			},
		},
		// {
		// 	ext: "SARIF",
		// 	findings: []Finding{
		// 		{
		// 			RuleID: "test-rule",
		// 		},
		// 	},
		// },
	}

	for i, test := range tests {
		tmpfile, err := os.Create(filepath.Join(tmpPath, strconv.Itoa(i)+test.ext))
		if err != nil {
			os.Remove(tmpfile.Name())
			t.Error(err)
		}
		err = Write(test.findings, config.Config{}, test.ext, tmpfile.Name())
		if err != nil {
			os.Remove(tmpfile.Name())
			t.Error(err)
		}
		got, err := os.ReadFile(tmpfile.Name())
		if err != nil {
			os.Remove(tmpfile.Name())
			t.Error(err)
		}
		os.Remove(tmpfile.Name())

		if len(got) == 0 && !test.wantEmpty {
			t.Errorf("got empty file with extension " + test.ext)
		}

		if test.wantEmpty {
			if len(got) > 0 {
				t.Errorf("Expected empty file, got %s", got)
			}
			continue
		}
	}
}
