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
	"strings"
	"testing"
)

func TestWriteCSV(t *testing.T) {
	tests := []struct {
		findings       []Finding
		testReportName string
		expected       string
		wantEmpty      bool
	}{
		{
			testReportName: "simple",
			expected:       filepath.Join(expectPath, "report", "csv_simple.csv"),
			findings: []Finding{
				{
					RuleID:      "test-rule",
					Match:       "line containing secret",
					Secret:      "a secret",
					StartLine:   1,
					EndLine:     2,
					StartColumn: 1,
					EndColumn:   2,
					Message:     "opps",
					File:        "auth.py",
					SymlinkFile: "",
					Commit:      "0000000000000000",
					Author:      "John Doe",
					Email:       "johndoe@gmail.com",
					Date:        "10-19-2003",
					Fingerprint: "fingerprint",
				},
			}},
		{

			wantEmpty:      true,
			testReportName: "empty",
			expected:       filepath.Join(expectPath, "report", "this_should_not_exist.csv"),
			findings:       []Finding{}},
	}

	for _, test := range tests {
		tmpfile, err := os.Create(filepath.Join(tmpPath, test.testReportName+".csv"))
		if err != nil {
			os.Remove(tmpfile.Name())
			t.Error(err)
		}
		err = writeCsv(test.findings, tmpfile)
		if err != nil {
			os.Remove(tmpfile.Name())
			t.Error(err)
		}
		got, err := os.ReadFile(tmpfile.Name())
		if err != nil {
			os.Remove(tmpfile.Name())
			t.Error(err)
		}
		if test.wantEmpty {
			if len(got) > 0 {
				t.Errorf("Expected empty file, got %s", got)
			}
			os.Remove(tmpfile.Name())
			continue
		}
		want, err := os.ReadFile(test.expected)
		if err != nil {
			os.Remove(tmpfile.Name())
			t.Error(err)
		}

		if string(got) != string(want) {
			err = os.WriteFile(strings.Replace(test.expected, ".csv", ".got.csv", 1), got, 0644)
			if err != nil {
				t.Error(err)
			}
			t.Errorf("got %s, want %s", string(got), string(want))
		}

		os.Remove(tmpfile.Name())
	}
}
