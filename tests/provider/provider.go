// Package provider is what the harness knows about the third parties Infisical
// calls out to.
//
// One entry per service, added when a suite first needs it. It carries only what
// creating a connection needs: the app slug, the hostname the client hardcodes, and
// the call itself. How the service behaves once reached belongs to its fake under
// fakes/, not here.
package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/google/uuid"
)

// Provider describes one third-party service.
type Provider struct {
	// App is the name in errors and the /api/v1/app-connections/<app> segment.
	App string

	// Host is what the provider's client has hardcoded, and is the key its fake is
	// registered under. It has to be hardcoded for the test to mean anything: a
	// configurable base URL could be pointed straight at fakenet, which would prove
	// the fake works and nothing about interception.
	Host string

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

	Create: func(ctx context.Context, c *api.ClientWithResponses, name, nonce string) (uuid.UUID, error) {
		// Host and instanceType are both left unset, which is what pins the call to
		// api.github.com. Setting host would point the client straight at fakenet,
		// and the test would prove nothing about interception.
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
