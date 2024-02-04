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
	"fmt"
	"regexp"
	"testing"

	"github.com/spf13/viper"
	"github.com/stretchr/testify/assert"
)

const configPath = "../testdata/config/"

func TestTranslate(t *testing.T) {
	tests := []struct {
		cfgName   string
		cfg       Config
		wantError error
	}{
		{
			cfgName: "allow_aws_re",
			cfg: Config{
				Rules: map[string]Rule{"aws-access-key": {
					Description: "AWS Access Key",
					Regex:       regexp.MustCompile("(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}"),
					Tags:        []string{"key", "AWS"},
					Keywords:    []string{},
					RuleID:      "aws-access-key",
					Allowlist: Allowlist{
						Regexes: []*regexp.Regexp{
							regexp.MustCompile("AKIALALEMEL33243OLIA"),
						},
					},
				},
				},
			},
		},
		{
			cfgName: "allow_commit",
			cfg: Config{
				Rules: map[string]Rule{"aws-access-key": {
					Description: "AWS Access Key",
					Regex:       regexp.MustCompile("(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}"),
					Tags:        []string{"key", "AWS"},
					Keywords:    []string{},
					RuleID:      "aws-access-key",
					Allowlist: Allowlist{
						Commits: []string{"allowthiscommit"},
					},
				},
				},
			},
		},
		{
			cfgName: "allow_path",
			cfg: Config{
				Rules: map[string]Rule{"aws-access-key": {
					Description: "AWS Access Key",
					Regex:       regexp.MustCompile("(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}"),
					Tags:        []string{"key", "AWS"},
					Keywords:    []string{},
					RuleID:      "aws-access-key",
					Allowlist: Allowlist{
						Paths: []*regexp.Regexp{
							regexp.MustCompile(".go"),
						},
					},
				},
				},
			},
		},
		{
			cfgName: "entropy_group",
			cfg: Config{
				Rules: map[string]Rule{"discord-api-key": {
					Description: "Discord API key",
					Regex:       regexp.MustCompile(`(?i)(discord[a-z0-9_ .\-,]{0,25})(=|>|:=|\|\|:|<=|=>|:).{0,5}['\"]([a-h0-9]{64})['\"]`),
					RuleID:      "discord-api-key",
					Allowlist:   Allowlist{},
					Entropy:     3.5,
					SecretGroup: 3,
					Tags:        []string{},
					Keywords:    []string{},
				},
				},
			},
		},
		{
			cfgName:   "bad_entropy_group",
			cfg:       Config{},
			wantError: fmt.Errorf("Discord API key invalid regex secret group 5, max regex secret group 3"),
		},
		{
			cfgName: "base",
			cfg: Config{
				Rules: map[string]Rule{
					"aws-access-key": {
						Description: "AWS Access Key",
						Regex:       regexp.MustCompile("(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}"),
						Tags:        []string{"key", "AWS"},
						Keywords:    []string{},
						RuleID:      "aws-access-key",
					},
					"aws-secret-key": {
						Description: "AWS Secret Key",
						Regex:       regexp.MustCompile(`(?i)aws_(.{0,20})?=?.[\'\"0-9a-zA-Z\/+]{40}`),
						Tags:        []string{"key", "AWS"},
						Keywords:    []string{},
						RuleID:      "aws-secret-key",
					},
					"aws-secret-key-again": {
						Description: "AWS Secret Key",
						Regex:       regexp.MustCompile(`(?i)aws_(.{0,20})?=?.[\'\"0-9a-zA-Z\/+]{40}`),
						Tags:        []string{"key", "AWS"},
						Keywords:    []string{},
						RuleID:      "aws-secret-key-again",
					},
				},
			},
		},
	}

	for _, tt := range tests {
		viper.Reset()
		viper.AddConfigPath(configPath)
		viper.SetConfigName(tt.cfgName)
		viper.SetConfigType("toml")
		err := viper.ReadInConfig()
		if err != nil {
			t.Error(err)
		}

		var vc ViperConfig
		err = viper.Unmarshal(&vc)
		if err != nil {
			t.Error(err)
		}
		cfg, err := vc.Translate()
		if tt.wantError != nil {
			if err == nil {
				t.Errorf("expected error")
			}
			assert.Equal(t, tt.wantError, err)
		}

		assert.Equal(t, cfg.Rules, tt.cfg.Rules)
	}
}
