package folderaccess_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func newProject(t *testing.T, tn *harness.Tenant) *fixture.Project {
	t.Helper()
	return fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
}

func at(secretPath string) secretmanager.Location {
	return secretmanager.Location{Env: "dev", Path: secretPath}
}

// grant is a folder grant as the folder access routes return it.
type grant struct {
	ID                       string     `json:"id"`
	FolderID                 string     `json:"folderId"`
	Permission               string     `json:"permission"`
	Environment              string     `json:"environment"`
	SecretPath               string     `json:"secretPath"`
	IsTemporary              bool       `json:"isTemporary"`
	TemporaryMode            *string    `json:"temporaryMode"`
	TemporaryRange           *string    `json:"temporaryRange"`
	TemporaryAccessStartTime *time.Time `json:"temporaryAccessStartTime"`
	TemporaryAccessEndTime   *time.Time `json:"temporaryAccessEndTime"`
}

// reply is one folder access write: its status, its message on failure and the grant on
// success.
type reply struct {
	status  int
	body    []byte
	message string
	grant   grant
}

func decodeReply(t *testing.T, status int, body []byte) reply {
	t.Helper()
	out := reply{status: status, body: body}
	var parsed struct {
		Message      any   `json:"message"`
		FolderAccess grant `json:"folderAccess"`
	}
	require.NoErrorf(t, json.Unmarshal(body, &parsed), "decoding %d: %s", status, apierr.Body(body))
	if msg, ok := parsed.Message.(string); ok {
		out.message = msg
	}
	out.grant = parsed.FolderAccess
	return out
}

func temporary(rangeText string, start time.Time) map[string]any {
	return map[string]any{
		"isTemporary":              true,
		"temporaryMode":            "relative",
		"temporaryRange":           rangeText,
		"temporaryAccessStartTime": start.UTC().Format(time.RFC3339Nano),
	}
}

// grantAs creates a folder grant for target through the route for its kind. extra adds
// or overrides body fields, such as a temporary type.
func grantAs(t *testing.T, actor *harness.Principal, proj *fixture.Project, target *harness.Principal,
	loc secretmanager.Location, tier secretmanager.FolderTier, extra map[string]any) reply {
	t.Helper()
	body := map[string]any{"environmentSlug": loc.Env, "secretPath": loc.Path, "permission": string(tier)}
	for k, v := range extra {
		body[k] = v
	}
	raw, err := json.Marshal(body)
	require.NoError(t, err)

	if target.Kind == harness.MachineIdentity {
		res, err := actor.API.CreateIdentityFolderAccessWithBodyWithResponse(t.Context(), proj.ID, target.ID,
			"application/json", bytes.NewReader(raw))
		require.NoError(t, err)
		return decodeReply(t, res.StatusCode(), res.Body)
	}
	res, err := actor.API.CreateUserFolderAccessWithBodyWithResponse(t.Context(), proj.ID, target.ID,
		"application/json", bytes.NewReader(raw))
	require.NoError(t, err)
	return decodeReply(t, res.StatusCode(), res.Body)
}

func updateGrant(t *testing.T, actor *harness.Principal, proj *fixture.Project, target *harness.Principal,
	loc secretmanager.Location, fields map[string]any) reply {
	t.Helper()
	body := map[string]any{"environmentSlug": loc.Env, "secretPath": loc.Path}
	for k, v := range fields {
		body[k] = v
	}
	raw, err := json.Marshal(body)
	require.NoError(t, err)

	if target.Kind == harness.MachineIdentity {
		res, err := actor.API.UpdateIdentityFolderAccessWithBodyWithResponse(t.Context(), proj.ID, target.ID,
			"application/json", bytes.NewReader(raw))
		require.NoError(t, err)
		return decodeReply(t, res.StatusCode(), res.Body)
	}
	res, err := actor.API.UpdateUserFolderAccessWithBodyWithResponse(t.Context(), proj.ID, target.ID,
		"application/json", bytes.NewReader(raw))
	require.NoError(t, err)
	return decodeReply(t, res.StatusCode(), res.Body)
}

func revokeGrant(t *testing.T, actor *harness.Principal, proj *fixture.Project, target *harness.Principal,
	loc secretmanager.Location) reply {
	t.Helper()
	raw, err := json.Marshal(map[string]any{"environmentSlug": loc.Env, "secretPath": loc.Path})
	require.NoError(t, err)

	if target.Kind == harness.MachineIdentity {
		res, err := actor.API.DeleteIdentityFolderAccessWithBodyWithResponse(t.Context(), proj.ID, target.ID,
			"application/json", bytes.NewReader(raw))
		require.NoError(t, err)
		return decodeReply(t, res.StatusCode(), res.Body)
	}
	res, err := actor.API.DeleteUserFolderAccessWithBodyWithResponse(t.Context(), proj.ID, target.ID,
		"application/json", bytes.NewReader(raw))
	require.NoError(t, err)
	return decodeReply(t, res.StatusCode(), res.Body)
}

// grantsOf is every folder grant target holds in the project, as the administrator
// reads them.
func grantsOf(t *testing.T, proj *fixture.Project, target *harness.Principal) []grant {
	t.Helper()
	status, body := listGrantsAs(t, proj.Tenant().Admin, proj, target)
	require.Equalf(t, http.StatusOK, status, "listing %s's grants: %s", target.Name, apierr.Body(body))
	var parsed struct {
		FolderAccess []grant `json:"folderAccess"`
	}
	require.NoError(t, json.Unmarshal(body, &parsed))
	return parsed.FolderAccess
}

func listGrantsAs(t *testing.T, actor *harness.Principal, proj *fixture.Project, target *harness.Principal) (int, []byte) {
	t.Helper()
	if target.Kind == harness.MachineIdentity {
		res, err := actor.API.ListIdentityFolderAccessWithResponse(t.Context(), proj.ID, target.ID)
		require.NoError(t, err)
		return res.StatusCode(), res.Body
	}
	res, err := actor.API.ListUserFolderAccessWithResponse(t.Context(), proj.ID, target.ID)
	require.NoError(t, err)
	return res.StatusCode(), res.Body
}

// listing is one v4 list with values requested: its status and each secret's value by
// key.
type listing struct {
	status int
	body   []byte
	values map[string]string
}

func listSecrets(t *testing.T, pr *harness.Principal, proj *fixture.Project, secretPath string, recursive bool) listing {
	t.Helper()
	params := &api.ListSecretsV4Params{
		ProjectId:       &proj.ID,
		Environment:     new("dev"),
		SecretPath:      &secretPath,
		ViewSecretValue: new(api.ListSecretsV4ParamsViewSecretValueTrue),
	}
	if recursive {
		params.Recursive = new(api.ListSecretsV4ParamsRecursiveTrue)
	}
	res, err := pr.API.ListSecretsV4WithResponse(t.Context(), params)
	require.NoError(t, err)
	out := listing{status: res.StatusCode(), body: res.Body, values: map[string]string{}}
	if res.JSON200 != nil {
		for _, s := range res.JSON200.Secrets {
			out.values[s.SecretKey] = s.SecretValue
		}
	}
	return out
}

func createSecret(t *testing.T, pr *harness.Principal, proj *fixture.Project, secretPath, name, value string) int {
	t.Helper()
	res, err := pr.API.CreateSecretV4WithResponse(t.Context(), name, api.CreateSecretV4JSONRequestBody{
		ProjectId: proj.ID, Environment: "dev", SecretPath: &secretPath, SecretValue: value,
	})
	require.NoError(t, err)
	return res.StatusCode()
}

// holder is one row of a folder's access list.
type holder struct {
	ID             string
	IsProjectAdmin bool
	Roles          []string
	Grant          *grant
}

// accessList is a folder's access list for one actor type: who has access, who has
// none, and the roster total.
type accessList struct {
	status  int
	body    []byte
	with    map[string]holder
	without map[string]holder
	total   int
}

type page struct {
	offset, limit *int
	search        *string
}

func listUsersAs(t *testing.T, actor *harness.Principal, proj *fixture.Project, loc secretmanager.Location, search string) accessList {
	t.Helper()
	p := page{}
	if search != "" {
		p.search = &search
	}
	return listAccess(t, actor, proj, harness.User, loc, p)
}

func listAccess(t *testing.T, actor *harness.Principal, proj *fixture.Project, kind harness.Kind, loc secretmanager.Location, p page) accessList {
	t.Helper()
	var status int
	var body []byte
	if kind == harness.MachineIdentity {
		res, err := actor.API.ListFolderAccessIdentitiesWithResponse(t.Context(), proj.ID, &api.ListFolderAccessIdentitiesParams{
			EnvironmentSlug: loc.Env, SecretPath: loc.Path, Offset: p.offset, Limit: p.limit, Search: p.search,
		})
		require.NoError(t, err)
		status, body = res.StatusCode(), res.Body
	} else {
		res, err := actor.API.ListFolderAccessUsersWithResponse(t.Context(), proj.ID, &api.ListFolderAccessUsersParams{
			EnvironmentSlug: loc.Env, SecretPath: loc.Path, Offset: p.offset, Limit: p.limit, Search: p.search,
		})
		require.NoError(t, err)
		status, body = res.StatusCode(), res.Body
	}

	out := accessList{status: status, body: body, with: map[string]holder{}, without: map[string]holder{}}
	if status != http.StatusOK {
		return out
	}
	type row struct {
		UserID     string `json:"userId"`
		IdentityID string `json:"identityId"`
		Membership struct {
			IsProjectAdmin bool `json:"isProjectAdmin"`
			Roles          []struct {
				Slug string `json:"slug"`
			} `json:"roles"`
		} `json:"membership"`
		FolderRBACAccess *grant `json:"folderRBACAccess"`
	}
	var parsed struct {
		Users                   []row `json:"users"`
		UsersWithoutAccess      []row `json:"usersWithoutAccess"`
		Identities              []row `json:"identities"`
		IdentitiesWithoutAccess []row `json:"identitiesWithoutAccess"`
		TotalCount              int   `json:"totalCount"`
	}
	require.NoError(t, json.Unmarshal(body, &parsed))
	toHolders := func(rows []row, into map[string]holder) {
		for _, r := range rows {
			h := holder{ID: r.UserID + r.IdentityID, IsProjectAdmin: r.Membership.IsProjectAdmin, Grant: r.FolderRBACAccess, Roles: []string{}}
			for _, role := range r.Membership.Roles {
				h.Roles = append(h.Roles, role.Slug)
			}
			require.NotContainsf(t, into, h.ID, "%s is listed twice", h.ID)
			into[h.ID] = h
		}
	}
	toHolders(append(parsed.Users, parsed.Identities...), out.with)
	toHolders(append(parsed.UsersWithoutAccess, parsed.IdentitiesWithoutAccess...), out.without)
	out.total = parsed.TotalCount
	return out
}

// secretsAt is what the administrator sees in one dev folder, by key.
func secretsAt(t *testing.T, proj *fixture.Project, secretPath string) map[string]string {
	t.Helper()
	got := listSecrets(t, proj.Tenant().Admin, proj, secretPath, false)
	require.Equalf(t, http.StatusOK, got.status, "listing dev:%s as the admin: %s", secretPath, apierr.Body(got.body))
	return got.values
}
