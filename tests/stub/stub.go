// Package stub registers WireMock mappings that can only match one caller.
//
// One WireMock serves the whole run, so isolation is by discriminator rather than
// by server: a scope carries request matchers that identify whoever owns it, every
// stub it registers inherits them, and every journal query filters on them. Two
// parallel tests stubbing the same method and path cannot see each other, and that
// is enforced when the stub is built rather than detected afterwards.
package stub

import (
	"context"
	"testing"

	"github.com/Infisical/infisical/tests/infra/wiremock"
)

// Scope registers stubs for one owner and counts what it received.
type Scope struct {
	client *wiremock.Client

	// match identifies the owner. Applied to every stub and every journal query.
	match map[string]wiremock.Matcher

	// tag groups this scope's mappings so cleanup removes only them.
	tag string
}

// New returns a scope. match must identify the owner and nothing else; an empty one
// would produce stubs that answer every tenant's requests.
func New(tt *testing.T, c *wiremock.Client, match map[string]wiremock.Matcher, tag string) *Scope {
	tt.Helper()
	if len(match) == 0 {
		tt.Fatal("stub: a scope needs a discriminator.\n" +
			"Without one its stubs would match every tenant's requests and the journal " +
			"counts would include other tests' calls.")
	}
	return &Scope{client: c, match: match, tag: tag}
}

// Remove deletes this scope's mappings, leaving everyone else's alone.
func (s *Scope) Remove(ctx context.Context) error {
	return s.client.RemoveByMetadata(ctx, "scope", s.tag)
}

// On starts a stub for a call the owner will make.
func (s *Scope) On(tt *testing.T, method, path string) *Builder {
	tt.Helper()
	return &Builder{scope: s, stub: wiremock.Stub{Method: method, URLPath: path}}
}

// Received counts the owner's requests to a method and path.
func (s *Scope) Received(tt *testing.T, method, path string) int {
	tt.Helper()

	n, err := s.client.Requests(tt.Context(), map[string]any{
		"method":  method,
		"urlPath": path,
		"headers": s.match,
	})
	if err != nil {
		tt.Fatalf("stub: reading the request journal: %v", err)
	}
	return n
}

// Register applies the discriminator and the scope tag, then installs the mapping.
func (s *Scope) Register(tt *testing.T, st wiremock.Stub) {
	tt.Helper()

	headers := make(map[string]wiremock.Matcher, len(s.match)+len(st.Headers))
	for k, v := range s.match {
		headers[k] = v
	}
	for k, v := range st.Headers {
		headers[k] = v
	}
	st.Headers = headers
	st.Metadata = map[string]string{"scope": s.tag}

	if _, err := s.client.Register(tt.Context(), st); err != nil {
		tt.Fatalf("stub: registering %s %s: %v", st.Method, st.URLPath, err)
	}
}

// Builder finishes a stub started by On.
type Builder struct {
	scope *Scope
	stub  wiremock.Stub
}

// Query narrows the stub to requests carrying a query parameter.
func (b *Builder) Query(name, value string) *Builder {
	if b.stub.Query == nil {
		b.stub.Query = map[string]wiremock.Matcher{}
	}
	b.stub.Query[name] = wiremock.EqualTo(value)
	return b
}

// Return registers the stub with a status and an optional JSON body.
func (b *Builder) Return(tt *testing.T, status int, body any) {
	tt.Helper()
	b.stub.Status = status
	b.stub.JSONBody = body
	b.scope.Register(tt, b.stub)
}
