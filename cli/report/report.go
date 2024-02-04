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
	"strings"

	"github.com/Infisical/infisical-merge/config"
)

const (
	// https://cwe.mitre.org/data/definitions/798.html
	CWE             = "CWE-798"
	CWE_DESCRIPTION = "Use of Hard-coded Credentials"
)

func Write(findings []Finding, cfg config.Config, ext string, reportPath string) error {
	file, err := os.Create(reportPath)
	if err != nil {
		return err
	}
	ext = strings.ToLower(ext)
	switch ext {
	case ".json", "json":
		err = writeJson(findings, file)
	case ".csv", "csv":
		err = writeCsv(findings, file)
	case ".sarif", "sarif":
		err = writeSarif(cfg, findings, file)
	}

	return err
}
