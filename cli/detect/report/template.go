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
	"fmt"
	"io"
	"os"
	"text/template"

	"github.com/Masterminds/sprig/v3"
)

type TemplateReporter struct {
	template *template.Template
}

var _ Reporter = (*TemplateReporter)(nil)

func NewTemplateReporter(templatePath string) (*TemplateReporter, error) {
	if templatePath == "" {
		return nil, fmt.Errorf("template path cannot be empty")
	}

	file, err := os.ReadFile(templatePath)
	if err != nil {
		return nil, fmt.Errorf("error reading file: %w", err)
	}
	templateText := string(file)

	// TODO: Add helper functions like escaping for JSON, XML, etc.
	t := template.New("custom")
	t = t.Funcs(sprig.TxtFuncMap())
	t, err = t.Parse(templateText)
	if err != nil {
		return nil, fmt.Errorf("error parsing file: %w", err)
	}
	return &TemplateReporter{template: t}, nil
}

// writeTemplate renders the findings using the user-provided template.
// https://www.digitalocean.com/community/tutorials/how-to-use-templates-in-go
func (t *TemplateReporter) Write(w io.WriteCloser, findings []Finding) error {
	if err := t.template.Execute(w, findings); err != nil {
		return err
	}
	return nil
}
