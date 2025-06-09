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

package scm

import (
	"fmt"
	"strings"
)

type Platform int

const (
	UnknownPlatform Platform = iota
	NoPlatform               // Explicitly disable the feature
	GitHubPlatform
	GitLabPlatform
	AzureDevOpsPlatform
	// TODO: Add others.
)

func (p Platform) String() string {
	return [...]string{
		"unknown",
		"none",
		"github",
		"gitlab",
		"azuredevops",
	}[p]
}

func PlatformFromString(s string) (Platform, error) {
	switch strings.ToLower(s) {
	case "", "unknown":
		return UnknownPlatform, nil
	case "none":
		return NoPlatform, nil
	case "github":
		return GitHubPlatform, nil
	case "gitlab":
		return GitLabPlatform, nil
	case "azuredevops":
		return AzureDevOpsPlatform, nil
	default:
		return UnknownPlatform, fmt.Errorf("invalid scm platform value: %s", s)
	}
}
