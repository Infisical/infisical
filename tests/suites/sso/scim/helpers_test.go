package scim_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/oidcidp"
	"github.com/Infisical/infisical/tests/fakes/samlidp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// IdPs send SCIM bodies with this type, not application/json.
const scimJSON = "application/scim+json"

const patchOpSchema = "urn:ietf:params:scim:api:messages:2.0:PatchOp"

// scim is a tenant wired the way a customer sets up provisioning: a verified domain,
// SSO, SCIM switched on, and a token pasted into the IdP. api is the IdP's client.
type scim struct {
	tn    *harness.Tenant
	saml  *sso.SAML
	oidc  *sso.OIDC
	token string
	api   *api.ClientWithResponses
}

type idpKind string

const (
	viaSAML idpKind = "saml"
	viaOIDC idpKind = "oidc"
)

func setup(t *testing.T) *scim {
	t.Helper()
	return setupWith(t, viaSAML, harness.From(t).NewTenant(t))
}

func setupWith(t *testing.T, kind idpKind, tn *harness.Tenant) *scim {
	t.Helper()
	s := &scim{tn: tn}
	if kind == viaOIDC {
		s.oidc = sso.NewOIDC(t, tn)
	} else {
		s.saml = sso.NewSAML(t, tn, sso.Okta)
	}
	requireOK(t, setScimEnabled(t, tn, true), "enabling SCIM")
	s.token = newToken(t, tn)
	s.api = tn.Client(t, s.token)
	return s
}

func newToken(t *testing.T, tn *harness.Tenant) string {
	t.Helper()
	res, err := tn.Admin.API.CreateScimTokenWithResponse(t.Context(), api.CreateScimTokenJSONRequestBody{
		OrganizationId: tn.OrgID.String(),
		Description:    new("idp-" + id.Short()),
	})
	require.NoError(t, err)
	requireOK(t, reply{res.StatusCode(), res.Body}, "creating SCIM token")
	return res.JSON200.ScimToken
}

func setScimEnabled(t *testing.T, tn *harness.Tenant, on bool) reply {
	t.Helper()
	res, err := tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(),
		api.UpdateOrganizationJSONRequestBody{ScimEnabled: new(on)})
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}
}

func scimEnabled(t *testing.T, tn *harness.Tenant) bool {
	t.Helper()
	res, err := tn.Admin.API.GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())
	require.NoError(t, err)
	requireOK(t, reply{res.StatusCode(), res.Body}, "reading the org")
	return res.JSON200.Organization.ScimEnabled != nil && *res.JSON200.Organization.ScimEnabled
}

// reply is any response, reduced to what a SCIM assertion reads.
type reply struct {
	status int
	body   []byte
}

func requireOK(t *testing.T, r reply, what string) {
	t.Helper()
	require.Equalf(t, http.StatusOK, r.status, "%s: %s", what, apierr.Body(r.body))
}

// errorText is the message from either envelope: SCIM's detail, or the house message.
func errorText(t *testing.T, r reply) string {
	t.Helper()
	var e struct {
		Detail  string `json:"detail"`
		Message string `json:"message"`
	}
	require.NoErrorf(t, json.Unmarshal(r.body, &e), "error body: %s", apierr.Body(r.body))
	if e.Detail != "" {
		return e.Detail
	}
	return e.Message
}

func scimType(t *testing.T, r reply) string {
	t.Helper()
	var e struct {
		ScimType string `json:"scimType"`
	}
	require.NoError(t, json.Unmarshal(r.body, &e))
	return e.ScimType
}

func decode[T any](t *testing.T, r reply) T {
	t.Helper()
	requireOK(t, r, "reading SCIM response")
	var out T
	require.NoError(t, json.Unmarshal(r.body, &out))
	return out
}

type scimUser struct {
	ID          string `json:"id"`
	UserName    string `json:"userName"`
	DisplayName string `json:"displayName"`
	Active      bool   `json:"active"`
	Name        struct {
		GivenName  string `json:"givenName"`
		FamilyName string `json:"familyName"`
	} `json:"name"`
	Emails []struct {
		Value   string `json:"value"`
		Primary bool   `json:"primary"`
	} `json:"emails"`
}

type scimGroup struct {
	ID          string       `json:"id"`
	DisplayName string       `json:"displayName"`
	Members     []scimMember `json:"members"`
}

type scimMember struct {
	Value   string `json:"value"`
	Display string `json:"display,omitempty"`
}

type listResponse[T any] struct {
	Resources    []T `json:"Resources"`
	TotalResults int `json:"totalResults"`
	ItemsPerPage int `json:"itemsPerPage"`
	StartIndex   int `json:"startIndex"`
}

// person is someone in the customer's directory. userName is what the IdP keys them
// on: the email for a SAML app, the subject for OIDC.
type person struct {
	userName   string
	email      string
	givenName  string
	familyName string
}

func (s *scim) person() person {
	email := s.tn.Email("user-" + id.Short())
	p := person{userName: email, email: email, givenName: "Grace", familyName: "Hopper"}
	if s.oidc != nil {
		p.userName = "sub-" + id.Short()
	}
	return p
}

// userBody is a POST /Users as Okta and Entra send it.
func userBody(p person) map[string]any {
	return map[string]any{
		"schemas":  []string{"urn:ietf:params:scim:schemas:core:2.0:User"},
		"userName": p.userName,
		"name":     map[string]string{"givenName": p.givenName, "familyName": p.familyName},
		"emails":   []map[string]any{{"primary": true, "value": p.email, "type": "work"}},
		"active":   true,
	}
}

func (s *scim) createUser(t *testing.T, body any) reply {
	t.Helper()
	return s.send(t, body, func(raw *bytes.Reader) (reply, error) {
		res, err := s.api.CreateScimUserWithBodyWithResponse(t.Context(), scimJSON, raw)
		if err != nil {
			return reply{}, err
		}
		return reply{res.StatusCode(), res.Body}, nil
	})
}

func (s *scim) provision(t *testing.T, p person) scimUser {
	t.Helper()
	return decode[scimUser](t, s.createUser(t, userBody(p)))
}

func (s *scim) getUser(t *testing.T, membershipID string) reply {
	t.Helper()
	res, err := s.api.GetScimUserWithResponse(t.Context(), membershipID)
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}
}

func (s *scim) listUsers(t *testing.T, params api.ListScimUsersParams) reply {
	t.Helper()
	res, err := s.api.ListScimUsersWithResponse(t.Context(), &params)
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}
}

func (s *scim) findUsers(t *testing.T, filter string) []scimUser {
	t.Helper()
	return decode[listResponse[scimUser]](t, s.listUsers(t, api.ListScimUsersParams{Filter: new(filter)})).Resources
}

func (s *scim) allUsers(t *testing.T) []scimUser {
	t.Helper()
	return decode[listResponse[scimUser]](t, s.listUsers(t, api.ListScimUsersParams{Count: new(float32(100))})).Resources
}

func (s *scim) patchUser(t *testing.T, membershipID string, ops ...map[string]any) reply {
	t.Helper()
	return s.send(t, patchBody(ops), func(raw *bytes.Reader) (reply, error) {
		res, err := s.api.PatchScimUserWithBodyWithResponse(t.Context(), membershipID, scimJSON, raw)
		if err != nil {
			return reply{}, err
		}
		return reply{res.StatusCode(), res.Body}, nil
	})
}

func (s *scim) replaceUser(t *testing.T, membershipID string, body any) reply {
	t.Helper()
	return s.send(t, body, func(raw *bytes.Reader) (reply, error) {
		res, err := s.api.ReplaceScimUserWithBodyWithResponse(t.Context(), membershipID, scimJSON, raw)
		if err != nil {
			return reply{}, err
		}
		return reply{res.StatusCode(), res.Body}, nil
	})
}

// replaceBody is a full PUT of p, as an IdP sends it on every profile change.
func replaceBody(p person, active bool) map[string]any {
	return map[string]any{
		"schemas":  []string{"urn:ietf:params:scim:schemas:core:2.0:User"},
		"userName": p.userName,
		"name":     map[string]string{"givenName": p.givenName, "familyName": p.familyName},
		"emails":   []map[string]any{{"primary": true, "value": p.email, "type": "work"}},
		"active":   active,
	}
}

func (s *scim) deleteUser(t *testing.T, membershipID string) reply {
	t.Helper()
	res, err := s.api.DeleteScimUserWithResponse(t.Context(), membershipID)
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}
}

func (s *scim) createGroup(t *testing.T, name string, memberIDs ...string) reply {
	t.Helper()
	return s.send(t, map[string]any{
		"schemas":     []string{"urn:ietf:params:scim:schemas:core:2.0:Group"},
		"displayName": name,
		"members":     members(memberIDs...),
	}, func(raw *bytes.Reader) (reply, error) {
		res, err := s.api.CreateScimGroupWithBodyWithResponse(t.Context(), scimJSON, raw)
		if err != nil {
			return reply{}, err
		}
		return reply{res.StatusCode(), res.Body}, nil
	})
}

func (s *scim) provisionGroup(t *testing.T, name string, memberIDs ...string) scimGroup {
	t.Helper()
	return decode[scimGroup](t, s.createGroup(t, name, memberIDs...))
}

func (s *scim) getGroup(t *testing.T, groupID string, params *api.GetScimGroupParams) reply {
	t.Helper()
	res, err := s.api.GetScimGroupWithResponse(t.Context(), groupID, params)
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}
}

func (s *scim) groupMembers(t *testing.T, groupID string) []string {
	t.Helper()
	g := decode[scimGroup](t, s.getGroup(t, groupID, nil))
	out := make([]string, 0, len(g.Members))
	for _, m := range g.Members {
		out = append(out, m.Value)
	}
	return out
}

func (s *scim) listGroups(t *testing.T, params api.ListScimGroupsParams) reply {
	t.Helper()
	res, err := s.api.ListScimGroupsWithResponse(t.Context(), &params)
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}
}

func (s *scim) patchGroup(t *testing.T, groupID string, ops ...map[string]any) reply {
	t.Helper()
	return s.send(t, patchBody(ops), func(raw *bytes.Reader) (reply, error) {
		res, err := s.api.PatchScimGroupWithBodyWithResponse(t.Context(), groupID, scimJSON, raw)
		if err != nil {
			return reply{}, err
		}
		return reply{res.StatusCode(), res.Body}, nil
	})
}

func (s *scim) replaceGroup(t *testing.T, groupID, name string, memberIDs ...string) reply {
	t.Helper()
	return s.send(t, map[string]any{
		"schemas":     []string{"urn:ietf:params:scim:schemas:core:2.0:Group"},
		"id":          groupID,
		"displayName": name,
		"members":     members(memberIDs...),
	}, func(raw *bytes.Reader) (reply, error) {
		res, err := s.api.ReplaceScimGroupWithBodyWithResponse(t.Context(), groupID, scimJSON, raw)
		if err != nil {
			return reply{}, err
		}
		return reply{res.StatusCode(), res.Body}, nil
	})
}

func (s *scim) deleteGroup(t *testing.T, groupID string) reply {
	t.Helper()
	res, err := s.api.DeleteScimGroupWithResponse(t.Context(), groupID)
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}
}

func (s *scim) send(t *testing.T, body any, call func(*bytes.Reader) (reply, error)) reply {
	t.Helper()
	raw, err := json.Marshal(body)
	require.NoError(t, err)
	r, err := call(bytes.NewReader(raw))
	require.NoError(t, err)
	return r
}

func members(ids ...string) []scimMember {
	out := make([]scimMember, 0, len(ids))
	for _, id := range ids {
		out = append(out, scimMember{Value: id})
	}
	return out
}

func patchBody(ops []map[string]any) map[string]any {
	return map[string]any{"schemas": []string{patchOpSchema}, "Operations": ops}
}

// op is one PatchOp operation. Okta and Entra differ in casing and in whether they
// send a path, so tests spell the op exactly as the IdP does.
func op(name, path string, value any) map[string]any {
	o := map[string]any{"op": name}
	if path != "" {
		o["path"] = path
	}
	if value != nil {
		o["value"] = value
	}
	return o
}

// signIn is the person logging in at the IdP and arriving back at Infisical.
func (s *scim) signIn(t *testing.T, p person) loginResult {
	t.Helper()
	if s.oidc != nil {
		res := s.oidc.Login(t, oidcidp.Person{
			Subject: p.userName, Email: p.email, EmailVerified: true,
			GivenName: p.givenName, FamilyName: p.familyName,
		})
		return loginResult{reply: reply{res.StatusCode(), res.Body}, http: res.HTTPResponse}
	}
	res := s.saml.SPLogin(t, samlidp.Response{NameID: p.userName, Email: p.email, FirstName: p.givenName, LastName: p.familyName})
	return loginResult{reply: reply{res.StatusCode(), res.Body}, http: res.HTTPResponse}
}

// ssoLinkedMember is an existing member as SCIM sees them once they have signed in
// through SAML, which gives them the alias SCIM updates go through.
func (s *scim) ssoLinkedMember(t *testing.T, member *harness.Principal) scimUser {
	t.Helper()
	s.saml.SPLogin(t, samlidp.Response{Email: member.Email, FirstName: "Org", LastName: "Member"})
	for _, u := range s.allUsers(t) {
		if u.UserName == member.Email {
			return u
		}
	}
	require.FailNowf(t, "member not listed", "%s is not listed by SCIM", member.Email)
	return scimUser{}
}

type loginResult struct {
	reply
	http *http.Response
}

// session takes a person from a SCIM invite to a working org session, the way they
// first arrive: log in, confirm the mailed code, log in again, pick the org.
func (s *scim) session(t *testing.T, p person) *api.ClientWithResponses {
	t.Helper()
	first := s.signIn(t, p)
	require.Equalf(t, http.StatusFound, first.status, "SSO login: %s", apierr.Body(first.body))
	if sso.RefreshCookie(first.http) == nil {
		s.completeSignup(t, first, p)
		first = s.signIn(t, p)
	}
	return sso.Session(t, s.tn, first.http)
}

func (s *scim) completeSignup(t *testing.T, login loginResult, p person) {
	t.Helper()
	code := sso.VerificationCode(t, s.tn, p.email)
	res := sso.CompleteSignup(t, s.tn, login.http, code)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "completing SSO signup: %s", apierr.Body(res.Body))
}

// enforce makes SSO the org's required login. The org requires one SSO login first.
func (s *scim) enforce(t *testing.T) {
	t.Helper()
	if s.saml != nil {
		s.saml.Enforce(t)
	} else {
		p := s.person()
		s.session(t, p)
		sso.Enforce(t, s.tn)
	}
}

// readsSecrets is the status a client gets listing a project's secrets: the plainest
// evidence of whether someone has project access.
func readsSecrets(t *testing.T, client *api.ClientWithResponses, proj *fixture.Project) int {
	t.Helper()
	res, err := client.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
		ProjectId:   new(proj.ID),
		Environment: new(proj.Environments[0]),
		SecretPath:  new("/"),
	})
	require.NoError(t, err)
	return res.StatusCode()
}

func asGroup(g scimGroup) *fixture.Group {
	return &fixture.Group{ID: uuid.MustParse(g.ID), Name: g.DisplayName}
}
