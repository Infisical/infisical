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
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"strconv"
)

type JunitReporter struct {
}

var _ Reporter = (*JunitReporter)(nil)

func (r *JunitReporter) Write(w io.WriteCloser, findings []Finding) error {
	testSuites := TestSuites{
		TestSuites: getTestSuites(findings),
	}

	io.WriteString(w, xml.Header)
	encoder := xml.NewEncoder(w)
	encoder.Indent("", "\t")
	return encoder.Encode(testSuites)
}

func getTestSuites(findings []Finding) []TestSuite {
	return []TestSuite{
		{
			Failures:  strconv.Itoa(len(findings)),
			Name:      "gitleaks",
			Tests:     strconv.Itoa(len(findings)),
			TestCases: getTestCases(findings),
			Time:      "",
		},
	}
}

func getTestCases(findings []Finding) []TestCase {
	testCases := []TestCase{}
	for _, f := range findings {
		testCase := TestCase{
			Classname: f.Description,
			Failure:   getFailure(f),
			File:      f.File,
			Name:      getMessage(f),
			Time:      "",
		}
		testCases = append(testCases, testCase)
	}
	return testCases
}

func getFailure(f Finding) Failure {
	return Failure{
		Data:    getData(f),
		Message: getMessage(f),
		Type:    f.Description,
	}
}

func getData(f Finding) string {
	data, err := json.MarshalIndent(f, "", "\t")
	if err != nil {
		fmt.Println(err)
		return ""
	}
	return string(data)
}

func getMessage(f Finding) string {
	if f.Commit == "" {
		return fmt.Sprintf("%s has detected a secret in file %s, line %s.", f.RuleID, f.File, strconv.Itoa(f.StartLine))
	}

	return fmt.Sprintf("%s has detected a secret in file %s, line %s, at commit %s.", f.RuleID, f.File, strconv.Itoa(f.StartLine), f.Commit)
}

type TestSuites struct {
	XMLName    xml.Name `xml:"testsuites"`
	TestSuites []TestSuite
}

type TestSuite struct {
	XMLName   xml.Name   `xml:"testsuite"`
	Failures  string     `xml:"failures,attr"`
	Name      string     `xml:"name,attr"`
	Tests     string     `xml:"tests,attr"`
	TestCases []TestCase `xml:"testcase"`
	Time      string     `xml:"time,attr"`
}

type TestCase struct {
	XMLName   xml.Name `xml:"testcase"`
	Classname string   `xml:"classname,attr"`
	Failure   Failure  `xml:"failure"`
	File      string   `xml:"file,attr"`
	Name      string   `xml:"name,attr"`
	Time      string   `xml:"time,attr"`
}

type Failure struct {
	XMLName xml.Name `xml:"failure"`
	Data    string   `xml:",chardata"`
	Message string   `xml:"message,attr"`
	Type    string   `xml:"type,attr"`
}
