//go:build integration

package projects_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/server/api/platform/projects"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/tests/infra"
)

var stack *infra.Stack

func TestMain(m *testing.M) {
	stack = infra.New().
		WithPostgres().
		WithRedis().
		WithNodeJSApi().
		MustStart()

	code := m.Run()
	stack.Stop()
	os.Exit(code)
}

// newProjectsRouter creates a projects router for HTTP testing.
func newProjectsRouter(t *testing.T) http.Handler {
	t.Helper()

	ctx := t.Context()
	permLib := permission.NewService(ctx, infra.NopLogger(), &permission.Deps{DB: stack.DB()})

	handler := projects.NewHandler(&projects.Deps{
		Logger:     infra.NopLogger(),
		Permission: permLib,
	})

	return projects.NewRouter(handler)
}

func TestGetHealth_ReturnsOK(t *testing.T) {
	router := newProjectsRouter(t)

	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/health", http.NoBody)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)

	var resp projects.GetHealthResponse
	err := json.NewDecoder(rec.Body).Decode(&resp)
	require.NoError(t, err)
	assert.Equal(t, "projects service is healthy", resp.Message)
}

func TestCreateProject_Success(t *testing.T) {
	router := newProjectsRouter(t)

	body := `{"name":"my-new-project","orgId":"` + stack.NodeJS().OrgID() + `"}`
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusCreated, rec.Code)

	var resp projects.CreateProjectResponse
	err := json.NewDecoder(rec.Body).Decode(&resp)
	require.NoError(t, err)
	assert.Equal(t, "my-new-project", resp.Name)
	assert.Equal(t, stack.NodeJS().OrgID(), resp.OrgID)
	assert.NotEmpty(t, resp.ID)
}
