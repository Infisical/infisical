// Package mail reads messages out of Mailpit.
//
// One Mailpit serves the whole run, so isolation is by address rather than by server:
// an Inbox is scoped to one tenant's mail domain and refuses to look outside it. Two
// parallel tenants can both invite "alice" without seeing each other's mail.
package mail

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Message is the part of a Mailpit message the harness cares about.
type Message struct {
	ID      string
	From    string
	To      []string
	Subject string

	// Body is the plain text and HTML parts joined. Callers search it for a link or a
	// code rather than caring which part carried it.
	Body string
}

// Inbox reads one tenant's mail.
type Inbox struct {
	api    string
	domain string
	hc     *http.Client
}

// NewInbox returns a view over Mailpit scoped to domain.
func NewInbox(api, domain string) *Inbox {
	return &Inbox{api: strings.TrimRight(api, "/"), domain: domain, hc: &http.Client{Timeout: 10 * time.Second}}
}

// Filter narrows what Await will accept.
type Filter func(Message) bool

// Subject accepts a message whose subject contains s.
func Subject(s string) Filter {
	return func(m Message) bool { return strings.Contains(m.Subject, s) }
}

// Await blocks until a message to addr matching every filter arrives.
//
// Mail is sent inline with the request that triggers it, so this is normally one round
// trip. It still polls, because "normally" is not "always" and a fixed sleep would
// either be slower than needed or flaky.
func (in *Inbox) Await(ctx context.Context, addr string, filters ...Filter) (Message, error) {
	if !strings.HasSuffix(addr, "@"+in.domain) {
		return Message{}, fmt.Errorf(
			"mail: this inbox is scoped to @%s but was asked for %s.\n"+
				"Reading another tenant's mail would make the test order-dependent; use tn.Address(local)",
			in.domain, addr)
	}

	deadline := time.Now().Add(20 * time.Second)
	var lastErr error
	for {
		msgs, err := in.search(ctx, "to:"+addr)
		if err != nil {
			lastErr = err
		}
		for _, m := range msgs {
			full, err := in.message(ctx, m.ID)
			if err != nil {
				lastErr = err
				continue
			}
			if matches(full, filters) {
				return full, nil
			}
		}
		if time.Now().After(deadline) {
			if lastErr != nil {
				return Message{}, fmt.Errorf("mail: no message for %s within 20s, last error: %w", addr, lastErr)
			}
			return Message{}, fmt.Errorf("mail: no message for %s within 20s (%d delivered, none matched)", addr, len(msgs))
		}
		select {
		case <-ctx.Done():
			return Message{}, ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}
}

func matches(m Message, filters []Filter) bool {
	for _, f := range filters {
		if !f(m) {
			return false
		}
	}
	return true
}

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

type searchResponse struct {
	Messages []struct {
		ID string `json:"ID"`
	} `json:"messages"`
}

func (in *Inbox) search(ctx context.Context, query string) ([]Message, error) {
	var res searchResponse
	if err := in.get(ctx, "/api/v1/search?query="+url.QueryEscape(query)+"&limit=50", &res); err != nil {
		return nil, err
	}
	out := make([]Message, 0, len(res.Messages))
	for _, m := range res.Messages {
		out = append(out, Message{ID: m.ID})
	}
	return out, nil
}

type messageResponse struct {
	ID      string `json:"ID"`
	Subject string `json:"Subject"`
	Text    string `json:"Text"`
	HTML    string `json:"HTML"`
	From    struct {
		Address string `json:"Address"`
	} `json:"From"`
	To []struct {
		Address string `json:"Address"`
	} `json:"To"`
}

func (in *Inbox) message(ctx context.Context, id string) (Message, error) {
	var res messageResponse
	if err := in.get(ctx, "/api/v1/message/"+url.PathEscape(id), &res); err != nil {
		return Message{}, err
	}
	m := Message{ID: res.ID, Subject: res.Subject, From: res.From.Address, Body: res.Text + "\n" + res.HTML}
	for _, to := range res.To {
		m.To = append(m.To, to.Address)
	}
	return m, nil
}

func (in *Inbox) get(ctx context.Context, path string, into any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, in.api+path, nil)
	if err != nil {
		return err
	}
	res, err := in.hc.Do(req)
	if err != nil {
		return fmt.Errorf("mail: %s: %w", path, err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("mail: %s returned %d", path, res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(into)
}
