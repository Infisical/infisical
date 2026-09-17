// Package provider is what the harness knows about the third parties Infisical
// calls out to.
//
// One entry per service, added when a suite first needs it. The point of the
// registry is that a test says "GitHub" and gets the hostname, the credential
// shape, the auth header to discriminate on and the calls that have to be stubbed
// before a connection can even be created -- none of which belong in a test file.
package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/infra/wiremock"
	"github.com/google/uuid"
)

// Provider describes one third-party service.
type Provider struct {
	// App is the name in errors and the /api/v1/app-connections/<app> segment.
	App string

	// Host is what the provider's client has hardcoded. It has to be hardcoded for
	// the test to mean anything: a configurable base URL could be pointed straight
	// at WireMock, which would prove the stub works and nothing about interception.
	Host string

	// Auth turns a connection's credential into request matchers that identify it.
	//
	// This is the discriminator. Two tenants stubbing the same method and path at
	// the same time are told apart by the credential the application sends, which
	// is unique per connection, so neither sees the other's requests. No org id has
	// to be threaded anywhere -- the application already proves who it is.
	Auth func(nonce string) map[string]wiremock.Matcher

	// Validate is what must be stubbed before a connection can be created, because
	// creating one calls the live API to check the credentials.
	Validate func(nonce string) []wiremock.Stub

	// Create makes the connection through the generated client.
	Create func(ctx context.Context, c *api.ClientWithResponses, name, nonce string) (uuid.UUID, error)
}

// GitHub over a personal access token.
//
// PAT rather than the GitHub App or OAuth methods because it is the one that needs
// no prior handshake: the App method requires a `code` from an install callback and
// a server-configured app, neither of which a blackbox test can produce. The
// outbound call is the same either way, which is what this is here to exercise.
var GitHub = Provider{
	App:  "github",
	Host: "api.github.com",

	Auth: func(nonce string) map[string]wiremock.Matcher {
		return map[string]wiremock.Matcher{"Authorization": wiremock.EqualTo("Bearer " + nonce)}
	},

	// GET /user, which validateGitHubConnectionCredentials calls for the PAT method.
	// Nothing parses the body, but a realistic one keeps the stub honest if a later
	// caller starts reading it.
	Validate: func(string) []wiremock.Stub {
		return []wiremock.Stub{{
			Method:  "GET",
			URLPath: "/user",
			JSONBody: map[string]any{
				"login": "harness",
				"id":    1,
				"type":  "User",
			},
		}}
	},

	Create: func(ctx context.Context, c *api.ClientWithResponses, name, nonce string) (uuid.UUID, error) {
		// Host and instanceType are both left unset, which is what pins the call to
		// api.github.com. Setting host would let the request reach WireMock without
		// the proxy, and the test would prove nothing about interception.
		var creds api.CreateGitHubAppConnectionJSONBody_2_Credentials
		if err := creds.FromCreateGitHubAppConnectionJSONBody2Credentials1(
			api.CreateGitHubAppConnectionJSONBody2Credentials1{PersonalAccessToken: nonce}); err != nil {
			return uuid.Nil, err
		}

		var body api.CreateGitHubAppConnectionJSONBody
		if err := body.FromCreateGitHubAppConnectionJSONBody2(api.CreateGitHubAppConnectionJSONBody2{
			Method:      api.CreateGitHubAppConnectionJSONBody2MethodPat,
			Credentials: creds,
		}); err != nil {
			return uuid.Nil, err
		}
		body.Name = name

		// Marshalled by hand for the same reason as the signup body: oapi-codegen
		// declares the request-body type as a defined type over the union struct,
		// and a defined type does not inherit MarshalJSON, so the union would
		// serialise as {}.
		raw, err := json.Marshal(body)
		if err != nil {
			return uuid.Nil, err
		}
		res, err := c.CreateGitHubAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
		if err != nil {
			return uuid.Nil, err
		}
		if res.JSON200 == nil {
			return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
		}
		conn, err := res.JSON200.AppConnection.AsCreateGitHubAppConnection200JSONResponseBodyAppConnection0()
		if err != nil {
			return uuid.Nil, err
		}
		return conn.Id, nil
	},
}
