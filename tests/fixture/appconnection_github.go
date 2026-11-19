package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/google/uuid"
)

// GitHubPATAppConnection is a GitHub App Connection over a personal access token.
//
// PAT rather than the GitHub App or OAuth methods because it is the one that needs
// no prior handshake: the App method requires a `code` from an install callback and
// a server-configured app, neither of which a blackbox test can produce. The
// outbound call is the same either way, which is what this is here to exercise.
var GitHubPATAppConnection = AppConnectionKind{
	App:    "github",
	Host:   github.Service.Host(),
	create: createGitHubPATAppConnection,
}

func createGitHubPATAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := GitHubPATAppConnectionBody(name, credential)
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
}

// GitHubPATAppConnectionBody is the create request, for a test that calls the route
// itself.
//
// Host and instanceType are both left unset, which is what pins the call to
// api.github.com. Setting host would point the client straight at fakenet, and the
// test would prove nothing about interception.
//
// Returned as bytes because oapi-codegen declares the request-body type as a defined
// type over the union struct, and a defined type does not inherit MarshalJSON, so the
// typed body would serialise as {}.
func GitHubPATAppConnectionBody(name, token string) ([]byte, error) {
	var creds api.CreateGitHubAppConnectionJSONBody_2_Credentials
	if err := creds.FromCreateGitHubAppConnectionJSONBody2Credentials1(
		api.CreateGitHubAppConnectionJSONBody2Credentials1{PersonalAccessToken: token}); err != nil {
		return nil, err
	}

	var body api.CreateGitHubAppConnectionJSONBody
	if err := body.FromCreateGitHubAppConnectionJSONBody2(api.CreateGitHubAppConnectionJSONBody2{
		Method:      api.CreateGitHubAppConnectionJSONBody2MethodPat,
		Credentials: creds,
	}); err != nil {
		return nil, err
	}
	body.Name = name
	return json.Marshal(body)
}
