package project_test

import (
	"slices"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
)

func TestProject_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("ok/creates a project in the tenant's organization", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)

		res, err := tn.Admin.API.CreateProjectWithResponse(t.Context(), api.CreateProjectJSONRequestBody{
			ProjectName: "app",
		})
		if err != nil {
			t.Fatalf("creating a project: %v", err)
		}
		if res.JSON200 == nil {
			t.Fatalf("creating a project returned %d: %s", res.StatusCode(), res.Body)
		}

		proj := res.JSON200.Project
		if proj.OrgId != tn.OrgID {
			t.Errorf("project landed in organization %s, want the caller's %s", proj.OrgId, tn.OrgID)
		}

		// Creating a project provisions its environments. A project without them is
		// not usable for anything, and the response is the only place a caller learns
		// what the slugs are.
		var envs []string
		for _, e := range proj.Environments {
			envs = append(envs, e.Slug)
		}
		for _, want := range []string{"dev", "staging", "prod"} {
			if !slices.Contains(envs, want) {
				t.Errorf("new project has environments %v, missing %q", envs, want)
			}
		}
	})
}
