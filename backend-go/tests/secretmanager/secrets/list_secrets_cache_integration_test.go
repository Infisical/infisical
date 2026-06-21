//go:build integration

package secrets_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/server/api/secretmanager/secret"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/tests/infra"
)

// httpListSecretsV4WithHeaders makes a direct HTTP GET request to /api/v4/secrets with custom headers.
func httpListSecretsV4WithHeaders(t *testing.T, srv *httptest.Server, params *ListSecretsV4Params, headers map[string]string) (*http.Response, []byte) {
	t.Helper()

	urlParams := url.Values{}
	urlParams.Set("projectId", params.ProjectID)
	urlParams.Set("environment", params.Environment)
	if params.SecretPath != nil {
		urlParams.Set("secretPath", *params.SecretPath)
	}
	if params.ViewSecretValue != nil {
		urlParams.Set("viewSecretValue", strconv.FormatBool(*params.ViewSecretValue))
	}
	if params.ExpandSecretReferences != nil {
		urlParams.Set("expandSecretReferences", strconv.FormatBool(*params.ExpandSecretReferences))
	}
	if params.Recursive != nil {
		urlParams.Set("recursive", strconv.FormatBool(*params.Recursive))
	}
	if params.IncludePersonalOverrides != nil {
		urlParams.Set("includePersonalOverrides", strconv.FormatBool(*params.IncludePersonalOverrides))
	}
	if params.IncludeImports != nil {
		urlParams.Set("includeImports", strconv.FormatBool(*params.IncludeImports))
	}
	if params.TagSlugs != nil {
		urlParams.Set("tagSlugs", *params.TagSlugs)
	}
	if params.MetadataFilter != nil {
		urlParams.Set("metadataFilter", *params.MetadataFilter)
	}

	path := fmt.Sprintf("/api/v4/secrets?%s", urlParams.Encode())

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, srv.URL+path, http.NoBody)
	require.NoError(t, err)

	for key, value := range headers {
		req.Header.Set(key, value)
	}

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	return resp, body
}

// =============================================================================
// ETag Middleware Tests
// These test the automatic ETag generation from response body (middlewares/etag.go)
// =============================================================================

func TestListSecretsETag_ReturnsETagHeader(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "etag-header-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ETAG_SECRET", "etag-value", nil)

	identity := nodejs.CreateIdentity(t, "etag-header-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID())
	defer srv.Close()

	resp, body := httpListSecretsV4WithHeaders(t, srv, &ListSecretsV4Params{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}, nil)

	assert.Equal(t, 200, resp.StatusCode)

	etag := resp.Header.Get("ETag")
	assert.NotEmpty(t, etag, "ETag header should be present")
	assert.Equal(t, `"`, string(etag[0]), "ETag should be quoted")
	assert.Equal(t, `"`, string(etag[len(etag)-1]), "ETag should be quoted")

	var respBody secret.ListSecretsV4Response
	require.NoError(t, json.Unmarshal(body, &respBody))
	require.Len(t, respBody.Secrets, 1)
	assert.Equal(t, "ETAG_SECRET", respBody.Secrets[0].SecretKey)
}

func TestListSecretsETag_Returns304WhenMatches(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "etag-304-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "CACHE_SECRET", "cache-value", nil)

	identity := nodejs.CreateIdentity(t, "etag-304-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID())
	defer srv.Close()

	params := &ListSecretsV4Params{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	firstResp, _ := httpListSecretsV4WithHeaders(t, srv, params, nil)
	require.Equal(t, 200, firstResp.StatusCode)

	etag := firstResp.Header.Get("ETag")
	require.NotEmpty(t, etag)

	secondResp, body := httpListSecretsV4WithHeaders(t, srv, params, map[string]string{
		"If-None-Match": etag,
	})

	assert.Equal(t, 304, secondResp.StatusCode)
	assert.Empty(t, body)
	assert.Equal(t, etag, secondResp.Header.Get("ETag"))
}

func TestListSecretsETag_Returns200WhenDiffers(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "etag-miss-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MISS_SECRET", "miss-value", nil)

	identity := nodejs.CreateIdentity(t, "etag-miss-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID())
	defer srv.Close()

	params := &ListSecretsV4Params{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	resp, body := httpListSecretsV4WithHeaders(t, srv, params, map[string]string{
		"If-None-Match": `"invalid-etag"`,
	})

	assert.Equal(t, 200, resp.StatusCode)
	assert.NotEmpty(t, body)

	var respBody secret.ListSecretsV4Response
	require.NoError(t, json.Unmarshal(body, &respBody))
	require.Len(t, respBody.Secrets, 1)
	assert.Equal(t, "MISS_SECRET", respBody.Secrets[0].SecretKey)
}

func TestListSecretsETag_ConsistentForSameContent(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "etag-consistent-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "CONSISTENT_SECRET", "consistent-value", nil)

	identity := nodejs.CreateIdentity(t, "etag-consistent-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID())
	defer srv.Close()

	params := &ListSecretsV4Params{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	firstResp, _ := httpListSecretsV4WithHeaders(t, srv, params, nil)
	require.Equal(t, 200, firstResp.StatusCode)
	firstEtag := firstResp.Header.Get("ETag")

	secondResp, _ := httpListSecretsV4WithHeaders(t, srv, params, nil)
	require.Equal(t, 200, secondResp.StatusCode)
	secondEtag := secondResp.Header.Get("ETag")

	assert.Equal(t, firstEtag, secondEtag)
}

func TestListSecretsETag_DiffersForDifferentParams(t *testing.T) {
	tests := []struct {
		name         string
		slug         string
		setupSecond  func(proj *infra.ProjectSeed) *ListSecretsV4Params
		setupProject func(t *testing.T, nodejs *infra.NodeJSService, proj *infra.ProjectSeed)
	}{
		{
			name: "different environment",
			slug: "etag-diff-env",
			setupProject: func(t *testing.T, nodejs *infra.NodeJSService, proj *infra.ProjectSeed) {
				customEnv := nodejs.CreateEnvironment(t, proj.ID, "custom-env", "Custom Env")
				nodejs.CreateSecret(t, proj.ID, customEnv.Slug, "/", "CUSTOM_SECRET", "custom-value", nil)
			},
			setupSecond: func(proj *infra.ProjectSeed) *ListSecretsV4Params {
				return &ListSecretsV4Params{
					ProjectID:       proj.ID,
					Environment:     "custom-env",
					SecretPath:      new("/"),
					ViewSecretValue: new(true),
				}
			},
		},
		{
			name: "different path",
			slug: "etag-diff-path",
			setupProject: func(t *testing.T, nodejs *infra.NodeJSService, proj *infra.ProjectSeed) {
				nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "config")
				nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/config", "CONFIG_SECRET", "config-value", nil)
			},
			setupSecond: func(proj *infra.ProjectSeed) *ListSecretsV4Params {
				return &ListSecretsV4Params{
					ProjectID:       proj.ID,
					Environment:     proj.EnvSlug,
					SecretPath:      new("/config"),
					ViewSecretValue: new(true),
				}
			},
		},
		{
			name: "recursive vs non-recursive",
			slug: "etag-diff-recursive",
			setupProject: func(t *testing.T, nodejs *infra.NodeJSService, proj *infra.ProjectSeed) {
				nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "nested")
				nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/nested", "NESTED_SECRET", "nested-value", nil)
			},
			setupSecond: func(proj *infra.ProjectSeed) *ListSecretsV4Params {
				return &ListSecretsV4Params{
					ProjectID:       proj.ID,
					Environment:     proj.EnvSlug,
					SecretPath:      new("/"),
					ViewSecretValue: new(true),
					Recursive:       new(true),
				}
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			nodejs := stack.NodeJS()

			proj := nodejs.CreateProject(t, tc.slug)
			nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ROOT_SECRET", "root-value", nil)
			tc.setupProject(t, nodejs, proj)

			identity := nodejs.CreateIdentity(t, tc.slug+"-identity")
			nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

			handler := newSecretsHandler(t)
			srv := newTestServer(t, handler, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID())
			defer srv.Close()

			firstParams := &ListSecretsV4Params{
				ProjectID:       proj.ID,
				Environment:     proj.EnvSlug,
				SecretPath:      new("/"),
				ViewSecretValue: new(true),
				Recursive:       new(false),
			}
			firstResp, _ := httpListSecretsV4WithHeaders(t, srv, firstParams, nil)
			require.Equal(t, 200, firstResp.StatusCode)
			firstEtag := firstResp.Header.Get("ETag")
			require.NotEmpty(t, firstEtag)

			secondParams := tc.setupSecond(proj)
			secondResp, _ := httpListSecretsV4WithHeaders(t, srv, secondParams, nil)
			require.Equal(t, 200, secondResp.StatusCode)
			secondEtag := secondResp.Header.Get("ETag")

			assert.NotEqual(t, firstEtag, secondEtag)
		})
	}
}

// =============================================================================
// Redis Cache Tests
// These test the handler-level encrypted payload caching (list_secrets_cache.go)
// =============================================================================

func TestListSecretsCache_StoresAndRetrievesFromRedis(t *testing.T) {
	nodejs := stack.NodeJS()
	redisClient := stack.Redis().Client()
	defer redisClient.Close()

	proj := nodejs.CreateProject(t, "cache-redis-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "CACHED_SECRET", "cached-value", nil)

	identity := nodejs.CreateIdentity(t, "cache-redis-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID())
	defer srv.Close()

	params := &ListSecretsV4Params{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	etagKeyPattern := "secret-etag:" + proj.ID + ":*"
	keysBefore, err := redisClient.Keys(context.Background(), etagKeyPattern).Result()
	require.NoError(t, err)

	firstResp, firstBody := httpListSecretsV4WithHeaders(t, srv, params, nil)
	require.Equal(t, 200, firstResp.StatusCode)

	var firstRespBody secret.ListSecretsV4Response
	require.NoError(t, json.Unmarshal(firstBody, &firstRespBody))
	require.Len(t, firstRespBody.Secrets, 1)

	keysAfter, err := redisClient.Keys(context.Background(), etagKeyPattern).Result()
	require.NoError(t, err)
	assert.Greater(t, len(keysAfter), len(keysBefore), "ETag should be stored in Redis after first request")

	secondResp, secondBody := httpListSecretsV4WithHeaders(t, srv, params, nil)
	require.Equal(t, 200, secondResp.StatusCode)

	var secondRespBody secret.ListSecretsV4Response
	require.NoError(t, json.Unmarshal(secondBody, &secondRespBody))
	require.Len(t, secondRespBody.Secrets, 1)
	assert.Equal(t, firstRespBody.Secrets[0].SecretKey, secondRespBody.Secrets[0].SecretKey)
	assert.Equal(t, firstRespBody.Secrets[0].SecretValue, secondRespBody.Secrets[0].SecretValue)
}

func TestListSecretsCache_IsolatedByActor(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "cache-actor-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ACTOR_SECRET", "actor-value", nil)

	identity1 := nodejs.CreateIdentity(t, "cache-actor-identity-1")
	nodejs.AddIdentityToProject(t, proj.ID, identity1.ID, infra.Role("admin"))

	identity2 := nodejs.CreateIdentity(t, "cache-actor-identity-2")
	nodejs.AddIdentityToProject(t, proj.ID, identity2.ID, infra.Role("admin"))

	handler := newSecretsHandler(t)

	srv1 := newTestServer(t, handler, auth.ActorTypeIdentity, identity1.ID, nodejs.OrgID())
	defer srv1.Close()

	srv2 := newTestServer(t, handler, auth.ActorTypeIdentity, identity2.ID, nodejs.OrgID())
	defer srv2.Close()

	params := &ListSecretsV4Params{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	resp1, _ := httpListSecretsV4WithHeaders(t, srv1, params, nil)
	require.Equal(t, 200, resp1.StatusCode)
	etag1 := resp1.Header.Get("ETag")

	resp2, body2 := httpListSecretsV4WithHeaders(t, srv2, params, map[string]string{
		"If-None-Match": etag1,
	})

	assert.Equal(t, 200, resp2.StatusCode, "Different actor should not get 304 from first actor's ETag")
	assert.NotEmpty(t, body2)
}

func TestListSecretsCache_Returns304FromHandlerCache(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "cache-handler-304-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "HANDLER_SECRET", "handler-value", nil)

	identity := nodejs.CreateIdentity(t, "cache-handler-304-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID())
	defer srv.Close()

	params := &ListSecretsV4Params{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	firstResp, _ := httpListSecretsV4WithHeaders(t, srv, params, nil)
	require.Equal(t, 200, firstResp.StatusCode)
	handlerEtag := firstResp.Header.Get("ETag")
	require.NotEmpty(t, handlerEtag)

	secondResp, body := httpListSecretsV4WithHeaders(t, srv, params, map[string]string{
		"If-None-Match": handlerEtag,
	})

	assert.Equal(t, 304, secondResp.StatusCode)
	assert.Empty(t, body)
}

func TestListSecretsCache_InvalidatedOnSecretChange(t *testing.T) {
	nodejs := stack.NodeJS()
	redisClient := stack.Redis().Client()
	defer redisClient.Close()

	proj := nodejs.CreateProject(t, "cache-invalidate-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "CHANGING_SECRET", "original-value", nil)

	identity := nodejs.CreateIdentity(t, "cache-invalidate-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID())
	defer srv.Close()

	params := &ListSecretsV4Params{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	firstResp, firstBody := httpListSecretsV4WithHeaders(t, srv, params, nil)
	require.Equal(t, 200, firstResp.StatusCode)
	firstEtag := firstResp.Header.Get("ETag")

	var firstRespBody secret.ListSecretsV4Response
	require.NoError(t, json.Unmarshal(firstBody, &firstRespBody))
	assert.Equal(t, "original-value", firstRespBody.Secrets[0].SecretValue)

	// Update the secret via Node.js API. This should invalidate the cache
	// by incrementing the DAL version and deleting the ETag key.
	nodejs.UpdateSecret(t, proj.ID, proj.EnvSlug, "/", "CHANGING_SECRET", "updated-value")

	// Second request with old ETag should get 200 (not 304) with updated value.
	secondResp, secondBody := httpListSecretsV4WithHeaders(t, srv, params, map[string]string{
		"If-None-Match": firstEtag,
	})

	assert.Equal(t, 200, secondResp.StatusCode, "Should return 200 after secret change, not 304")

	if secondResp.StatusCode == 200 {
		var secondRespBody secret.ListSecretsV4Response
		require.NoError(t, json.Unmarshal(secondBody, &secondRespBody))
		assert.Equal(t, "updated-value", secondRespBody.Secrets[0].SecretValue)

		newEtag := secondResp.Header.Get("ETag")
		assert.NotEqual(t, firstEtag, newEtag, "ETag should change after secret update")
	}
}
