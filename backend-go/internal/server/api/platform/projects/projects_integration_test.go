//go:build integration

package projects_test

import (
	"context"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/server/api/platform/projects"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/testutil"
	"github.com/infisical/api/internal/testutil/infra"
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

// newProjectsHandler creates a projects handler for testing.
func newProjectsHandler(t *testing.T) *projects.Handler {
	t.Helper()

	ctx := context.Background()
	permLib := permission.NewService(ctx, testutil.NopLogger(), &permission.Deps{DB: stack.DB()})

	return projects.NewHandler(&projects.Deps{
		Logger:     testutil.NopLogger(),
		Permission: permLib,
	})
}

func TestGetHealth_ReturnsOK(t *testing.T) {
	handler := newProjectsHandler(t)

	result, err := handler.GetHealth(context.Background(), nil)
	require.NoError(t, err)
	assert.Equal(t, "projects service is healthy", result.Message)
}

func TestCreateProject_Success(t *testing.T) {
	handler := newProjectsHandler(t)

	result, err := handler.CreateProject(context.Background(), &projects.CreateProjectRequest{
		Name:  "my-new-project",
		OrgID: stack.NodeJS().OrgID(),
	})

	require.NoError(t, err)
	assert.Equal(t, "my-new-project", result.Name)
	assert.Equal(t, stack.NodeJS().OrgID(), result.OrgID)
	assert.NotEmpty(t, result.ID)
}
