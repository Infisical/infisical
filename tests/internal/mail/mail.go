// Package mail pulls what a test needs out of a delivered message: a link, a query
// parameter, or a numeric code.
package mail

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/Infisical/infisical/tests/fakes/smtp"
)

type Message = smtp.Message

// Link returns the first URL in the body whose query carries param.
//
// Every Infisical mail that hands the recipient a secret does it as a query parameter
// on a SITE_URL link, so this is the one extraction the harness needs.
func Link(m Message, param string) (*url.URL, error) {
	for _, raw := range urlsIn(m.Body) {
		u, err := url.Parse(raw)
		if err != nil {
			continue
		}
		if u.Query().Get(param) != "" {
			return u, nil
		}
	}
	return nil, fmt.Errorf("mail: no link carrying %q in %q:\n%s", param, m.Subject, m.Body)
}

// Param returns one query parameter from the first link that carries it.
func Param(m Message, name string) (string, error) {
	u, err := Link(m, name)
	if err != nil {
		return "", err
	}
	return u.Query().Get(name), nil
}

// urlsIn pulls http(s) URLs out of text. HTML attributes quote them and plain text
// parts may wrap them in angle brackets or end them with punctuation, so the
// terminators are broader than whitespace.
func urlsIn(body string) []string {
	var out []string
	for i := 0; i < len(body); {
		j := strings.Index(body[i:], "http")
		if j < 0 {
			break
		}
		start := i + j
		end := start
		for end < len(body) && !strings.ContainsRune("\"'<> \t\r\n", rune(body[end])) {
			end++
		}
		out = append(out, strings.TrimRight(body[start:end], ".,)"))
		i = end + 1
	}
	return out
}

// Code returns the first run of exactly n digits in the body.
//
// The signup and MFA mails carry a numeric code rather than a link, so Param
// cannot reach it. Bounded on both sides so a longer number, such as a timestamp in
// a footer, is not mistaken for a six-digit code.
func Code(m Message, n int) (string, error) {
	runs := 0
	for i := 0; i <= len(m.Body); i++ {
		if i < len(m.Body) && m.Body[i] >= '0' && m.Body[i] <= '9' {
			runs++
			continue
		}
		if runs == n {
			return m.Body[i-n : i], nil
		}
		runs = 0
	}
	return "", fmt.Errorf("mail: no %d-digit code in %q:\n%s", n, m.Subject, m.Body)
}
