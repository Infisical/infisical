//go:build integration

package secrets_test

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/server/api/secrets/secret"
	"github.com/infisical/api/tests/infra"
)

// listRaw issues a list request with optional headers and returns the raw
// status, body, and response headers. Cache/ETag tests need access to status
// codes and the ETag header, which the typed helpers hide.
func listRaw(client *infra.HTTPClient, q *secret.ListSecretsV4Query, headers map[string]string) (body []byte, status int, header http.Header) {
	req := client.Get("/api/v4/secrets").Params(q)
	for k, v := range headers {
		req.Header(k, v)
	}
	return req.Do()
}

func TestListSecrets_ETag_ReturnsHeader(t *testing.T) {
	t.Parallel()
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "etag-header")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ETAG_SECRET", "etag-value", nil)

	identity := nodejs.CreateIdentity(t, "etag-header-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
		Build()

	q := secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	body, status, header := listRaw(client, &q, nil)
	require.Equal(t, 200, status)

	etag := header.Get("ETag")
	require.NotEmpty(t, etag, "ETag header should be present")
	assert.Equal(t, byte('"'), etag[0], "ETag should be quoted")
	assert.Equal(t, byte('"'), etag[len(etag)-1], "ETag should be quoted")

	var resp secret.ListSecretsV4Response
	require.NoError(t, json.Unmarshal(body, &resp))
	require.Len(t, resp.Secrets, 1)
	assert.Equal(t, "ETAG_SECRET", resp.Secrets[0].SecretKey)
}

func TestListSecrets_ETag_Returns304WhenMatches(t *testing.T) {
	t.Parallel()
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "etag-304")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "CACHE_SECRET", "cache-value", nil)

	identity := nodejs.CreateIdentity(t, "etag-304-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
		Build()

	q := secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	_, status, header := listRaw(client, &q, nil)
	require.Equal(t, 200, status)
	etag := header.Get("ETag")
	require.NotEmpty(t, etag)

	body, status, header := listRaw(client, &q, map[string]string{"If-None-Match": etag})
	assert.Equal(t, 304, status)
	assert.Empty(t, body)
	assert.Equal(t, etag, header.Get("ETag"))
}

func TestListSecrets_ETag_Returns200WhenDiffers(t *testing.T) {
	t.Parallel()
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "etag-miss")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MISS_SECRET", "miss-value", nil)

	identity := nodejs.CreateIdentity(t, "etag-miss-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
		Build()

	q := secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	body, status, _ := listRaw(client, &q, map[string]string{"If-None-Match": `"invalid-etag"`})
	assert.Equal(t, 200, status)
	assert.NotEmpty(t, body)

	var resp secret.ListSecretsV4Response
	require.NoError(t, json.Unmarshal(body, &resp))
	require.Len(t, resp.Secrets, 1)
	assert.Equal(t, "MISS_SECRET", resp.Secrets[0].SecretKey)
}

func TestListSecrets_ETag_ConsistentForSameContent(t *testing.T) {
	t.Parallel()
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "etag-consistent")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "CONSISTENT_SECRET", "consistent-value", nil)

	identity := nodejs.CreateIdentity(t, "etag-consistent-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
		Build()

	q := secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	_, status, header := listRaw(client, &q, nil)
	require.Equal(t, 200, status)
	firstEtag := header.Get("ETag")

	_, status, header = listRaw(client, &q, nil)
	require.Equal(t, 200, status)
	secondEtag := header.Get("ETag")

	assert.Equal(t, firstEtag, secondEtag)
}

func TestListSecrets_ETag_DiffersForDifferentParams(t *testing.T) {
	tests := []struct {
		name        string
		setupSecond func(t *testing.T, nodejs *infra.NodeJSService, proj *infra.ProjectSeed) secret.ListSecretsV4Query
	}{
		{
			name: "different environment",
			setupSecond: func(t *testing.T, nodejs *infra.NodeJSService, proj *infra.ProjectSeed) secret.ListSecretsV4Query {
				nodejs.CreateEnvironment(t, proj.ID, "custom-env", "Custom Env")
				nodejs.CreateSecret(t, proj.ID, "custom-env", "/", "CUSTOM_SECRET", "custom-value", nil)
				return secret.ListSecretsV4Query{
					ProjectID: proj.ID, Environment: "custom-env", SecretPath: new("/"), ViewSecretValue: new(true),
				}
			},
		},
		{
			name: "different path",
			setupSecond: func(t *testing.T, nodejs *infra.NodeJSService, proj *infra.ProjectSeed) secret.ListSecretsV4Query {
				nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "config")
				nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/config", "CONFIG_SECRET", "config-value", nil)
				return secret.ListSecretsV4Query{
					ProjectID: proj.ID, Environment: proj.EnvSlug, SecretPath: new("/config"), ViewSecretValue: new(true),
				}
			},
		},
		{
			name: "recursive vs non-recursive",
			setupSecond: func(t *testing.T, nodejs *infra.NodeJSService, proj *infra.ProjectSeed) secret.ListSecretsV4Query {
				nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "nested")
				nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/nested", "NESTED_SECRET", "nested-value", nil)
				return secret.ListSecretsV4Query{
					ProjectID: proj.ID, Environment: proj.EnvSlug, SecretPath: new("/"), ViewSecretValue: new(true), Recursive: new(true),
				}
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nodejs := stack.NodeJS()

			proj := nodejs.CreateProject(t, "etag-diff-params")
			nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ROOT_SECRET", "root-value", nil)
			secondQuery := tc.setupSecond(t, nodejs, proj)

			identity := nodejs.CreateIdentity(t, "etag-diff-params-identity")
			nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
				Build()

			_, status, header := listRaw(client, &secret.ListSecretsV4Query{
				ProjectID: proj.ID, Environment: proj.EnvSlug, SecretPath: new("/"), ViewSecretValue: new(true), Recursive: new(false),
			}, nil)
			require.Equal(t, 200, status)
			firstEtag := header.Get("ETag")
			require.NotEmpty(t, firstEtag)

			_, status, header = listRaw(client, &secondQuery, nil)
			require.Equal(t, 200, status)
			secondEtag := header.Get("ETag")

			assert.NotEqual(t, firstEtag, secondEtag)
		})
	}
}

func TestListSecrets_Cache_StoresInRedis(t *testing.T) {
	t.Parallel()
	nodejs := stack.NodeJS()
	redisClient := stack.Redis().Client()
	t.Cleanup(func() { redisClient.Close() })

	proj := nodejs.CreateProject(t, "cache-redis")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "CACHED_SECRET", "cached-value", nil)

	identity := nodejs.CreateIdentity(t, "cache-redis-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
		Build()

	q := secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	etagKeyPattern := "secret-etag:" + proj.ID + ":*"
	keysBefore, err := redisClient.Keys(context.Background(), etagKeyPattern).Result()
	require.NoError(t, err)

	body, status, _ := listRaw(client, &q, nil)
	require.Equal(t, 200, status)
	var first secret.ListSecretsV4Response
	require.NoError(t, json.Unmarshal(body, &first))
	require.Len(t, first.Secrets, 1)

	keysAfter, err := redisClient.Keys(context.Background(), etagKeyPattern).Result()
	require.NoError(t, err)
	assert.Greater(t, len(keysAfter), len(keysBefore), "ETag should be stored in Redis after first request")

	body, status, _ = listRaw(client, &q, nil)
	require.Equal(t, 200, status)
	var second secret.ListSecretsV4Response
	require.NoError(t, json.Unmarshal(body, &second))
	require.Len(t, second.Secrets, 1)
	assert.Equal(t, first.Secrets[0].SecretKey, second.Secrets[0].SecretKey)
	assert.Equal(t, first.Secrets[0].SecretValue, second.Secrets[0].SecretValue)
}

func TestListSecrets_Cache_IsolatedByActor(t *testing.T) {
	t.Parallel()
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "cache-actor")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ACTOR_SECRET", "actor-value", nil)

	identity1 := nodejs.CreateIdentity(t, "cache-actor-identity-1")
	nodejs.AddIdentityToProject(t, proj.ID, identity1.ID, infra.Role("admin"))

	identity2 := nodejs.CreateIdentity(t, "cache-actor-identity-2")
	nodejs.AddIdentityToProject(t, proj.ID, identity2.ID, infra.Role("admin"))

	// Both clients share one router/handler so the cache state is shared; only
	// the actor differs.
	router := newSecretsRouter(t)
	client1 := infra.NewClientBuilder(t, router).Identity(infra.MachineIdentity(identity1.ID, nodejs.OrgID())).Build()
	client2 := infra.NewClientBuilder(t, router).Identity(infra.MachineIdentity(identity2.ID, nodejs.OrgID())).Build()

	q := secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	_, status, header := listRaw(client1, &q, nil)
	require.Equal(t, 200, status)
	etag1 := header.Get("ETag")

	body2, status2, _ := listRaw(client2, &q, map[string]string{"If-None-Match": etag1})
	assert.Equal(t, 200, status2, "different actor should not get 304 from first actor's ETag")
	assert.NotEmpty(t, body2)
}

func TestListSecrets_Cache_Returns304FromHandlerCache(t *testing.T) {
	t.Parallel()
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "cache-handler-304")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "HANDLER_SECRET", "handler-value", nil)

	identity := nodejs.CreateIdentity(t, "cache-handler-304-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	// One client => one handler, so the second request hits the same in-process
	// cache the first populated.
	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
		Build()

	q := secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	_, status, header := listRaw(client, &q, nil)
	require.Equal(t, 200, status)
	handlerEtag := header.Get("ETag")
	require.NotEmpty(t, handlerEtag)

	body, status, _ := listRaw(client, &q, map[string]string{"If-None-Match": handlerEtag})
	assert.Equal(t, 304, status)
	assert.Empty(t, body)
}

func TestListSecrets_Cache_InvalidatedOnSecretChange(t *testing.T) {
	t.Parallel()
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "cache-invalidate")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "CHANGING_SECRET", "original-value", nil)

	identity := nodejs.CreateIdentity(t, "cache-invalidate-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
		Build()

	q := secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	body, status, header := listRaw(client, &q, nil)
	require.Equal(t, 200, status)
	firstEtag := header.Get("ETag")
	var first secret.ListSecretsV4Response
	require.NoError(t, json.Unmarshal(body, &first))
	assert.Equal(t, "original-value", first.Secrets[0].SecretValue)

	// Updating the secret increments the DAL version and deletes the ETag key,
	// invalidating the cache.
	nodejs.UpdateSecret(t, proj.ID, proj.EnvSlug, "/", "CHANGING_SECRET", "updated-value")

	body, status, header = listRaw(client, &q, map[string]string{"If-None-Match": firstEtag})
	require.Equal(t, 200, status, "should return 200 after secret change, not 304")

	var second secret.ListSecretsV4Response
	require.NoError(t, json.Unmarshal(body, &second))
	assert.Equal(t, "updated-value", second.Secrets[0].SecretValue)
	assert.NotEqual(t, firstEtag, header.Get("ETag"), "ETag should change after secret update")
}

// TestListSecrets_Cache_ConcurrentAccess hammers the same handler/cache from many
// goroutines. It guards against data races (run with -race) and confirms every
// concurrent reader gets a consistent, correct response.
func TestListSecrets_Cache_ConcurrentAccess(t *testing.T) {
	t.Parallel()
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "cache-concurrent")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "CONCURRENT_SECRET", "concurrent-value", nil)

	identity := nodejs.CreateIdentity(t, "cache-concurrent-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
		Build()

	q := secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}

	const workers = 16
	var wg sync.WaitGroup
	statuses := make([]int, workers)
	values := make([]string, workers)
	errs := make([]error, workers)

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			body, status, _ := listRaw(client, &q, nil)
			statuses[i] = status
			var resp secret.ListSecretsV4Response
			if err := json.Unmarshal(body, &resp); err != nil {
				errs[i] = err
				return
			}
			if len(resp.Secrets) == 1 {
				values[i] = resp.Secrets[0].SecretValue
			}
		}(i)
	}
	wg.Wait()

	for i := 0; i < workers; i++ {
		require.NoError(t, errs[i])
		assert.Equal(t, 200, statuses[i])
		assert.Equal(t, "concurrent-value", values[i])
	}
}
