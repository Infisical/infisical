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
	"fmt"
	"io"

	"github.com/Infisical/infisical-merge/config"
)

func writeSarif(cfg config.Config, findings []Finding, w io.WriteCloser) error {
	sarif := Sarif{
		Schema:  "https://json.schemastore.org/sarif-2.1.0.json",
		Version: "2.1.0",
		Runs:    getRuns(cfg, findings),
	}

	encoder := json.NewEncoder(w)
	encoder.SetIndent("", " ")
	return encoder.Encode(sarif)
}

func getRuns(cfg config.Config, findings []Finding) []Runs {
	return []Runs{
		{
			Tool:    getTool(cfg),
			Results: getResults(findings),
		},
	}
}

func getTool(cfg config.Config) Tool {
	tool := Tool{
		Driver: Driver{
			Name:            driver,
			SemanticVersion: version,
			InformationUri:  "https://github.com/Infisical/infisical",
			Rules:           getRules(cfg),
		},
	}

	// if this tool has no rules, ensure that it is represented as [] instead of null/nil
	if hasEmptyRules(tool) {
		tool.Driver.Rules = make([]Rules, 0)
	}

	return tool
}

func hasEmptyRules(tool Tool) bool {
	return len(tool.Driver.Rules) == 0
}

func getRules(cfg config.Config) []Rules {
	// TODO	for _, rule := range cfg.Rules {
	var rules []Rules
	for _, rule := range cfg.OrderedRules() {
		shortDescription := ShortDescription{
			Text: rule.Description,
		}
		if rule.Regex != nil {
			shortDescription = ShortDescription{
				Text: rule.Regex.String(),
			}
		} else if rule.Path != nil {
			shortDescription = ShortDescription{
				Text: rule.Path.String(),
			}
		}
		rules = append(rules, Rules{
			ID:          rule.RuleID,
			Name:        rule.Description,
			Description: shortDescription,
		})
	}
	return rules
}

func messageText(f Finding) string {
	if f.Commit == "" {
		return fmt.Sprintf("%s has detected secret for file %s.", f.RuleID, f.File)
	}

	return fmt.Sprintf("%s has detected secret for file %s at commit %s.", f.RuleID, f.File, f.Commit)

}

func getResults(findings []Finding) []Results {
	results := []Results{}
	for _, f := range findings {
		r := Results{
			Message: Message{
				Text: messageText(f),
			},
			RuleId:    f.RuleID,
			Locations: getLocation(f),
			// This information goes in partial fingerprings until revision
			// data can be added somewhere else
			PartialFingerPrints: PartialFingerPrints{
				CommitSha:     f.Commit,
				Email:         f.Email,
				CommitMessage: f.Message,
				Date:          f.Date,
				Author:        f.Author,
			},
		}
		results = append(results, r)
	}
	return results
}

func getLocation(f Finding) []Locations {
	uri := f.File
	if f.SymlinkFile != "" {
		uri = f.SymlinkFile
	}
	return []Locations{
		{
			PhysicalLocation: PhysicalLocation{
				ArtifactLocation: ArtifactLocation{
					URI: uri,
				},
				Region: Region{
					StartLine:   f.StartLine,
					EndLine:     f.EndLine,
					StartColumn: f.StartColumn,
					EndColumn:   f.EndColumn,
					Snippet: Snippet{
						Text: f.Secret,
					},
				},
			},
		},
	}
}

type PartialFingerPrints struct {
	CommitSha     string `json:"commitSha"`
	Email         string `json:"email"`
	Author        string `json:"author"`
	Date          string `json:"date"`
	CommitMessage string `json:"commitMessage"`
}

type Sarif struct {
	Schema  string `json:"$schema"`
	Version string `json:"version"`
	Runs    []Runs `json:"runs"`
}

type ShortDescription struct {
	Text string `json:"text"`
}

type FullDescription struct {
	Text string `json:"text"`
}

type Rules struct {
	ID          string           `json:"id"`
	Name        string           `json:"name"`
	Description ShortDescription `json:"shortDescription"`
}

type Driver struct {
	Name            string  `json:"name"`
	SemanticVersion string  `json:"semanticVersion"`
	InformationUri  string  `json:"informationUri"`
	Rules           []Rules `json:"rules"`
}

type Tool struct {
	Driver Driver `json:"driver"`
}

type Message struct {
	Text string `json:"text"`
}

type ArtifactLocation struct {
	URI string `json:"uri"`
}

type Region struct {
	StartLine   int     `json:"startLine"`
	StartColumn int     `json:"startColumn"`
	EndLine     int     `json:"endLine"`
	EndColumn   int     `json:"endColumn"`
	Snippet     Snippet `json:"snippet"`
}

type Snippet struct {
	Text string `json:"text"`
}

type PhysicalLocation struct {
	ArtifactLocation ArtifactLocation `json:"artifactLocation"`
	Region           Region           `json:"region"`
}

type Locations struct {
	PhysicalLocation PhysicalLocation `json:"physicalLocation"`
}

type Results struct {
	Message             Message     `json:"message"`
	RuleId              string      `json:"ruleId"`
	Locations           []Locations `json:"locations"`
	PartialFingerPrints `json:"partialFingerprints"`
}

type Runs struct {
	Tool    Tool      `json:"tool"`
	Results []Results `json:"results"`
}
