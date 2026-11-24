package folders_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func setQuery(key, value string) api.RequestEditorFn {
	return func(_ context.Context, req *http.Request) error {
		q := req.URL.Query()
		q.Set(key, value)
		req.URL.RawQuery = q.Encode()
		return nil
	}
}

func delQuery(key string) api.RequestEditorFn {
	return func(_ context.Context, req *http.Request) error {
		q := req.URL.Query()
		q.Del(key)
		req.URL.RawQuery = q.Encode()
		return nil
	}
}

func required(field string) map[string]any {
	return map[string]any{"code": "invalid_type", "expected": "string", "received": "undefined", "path": []any{field}, "message": "Required"}
}

func invalidDatetime() map[string]any {
	return map[string]any{"code": "invalid_string", "validation": "datetime", "message": "Invalid datetime", "path": []any{"lastSecretModified"}}
}

func TestFolder_List_Validation(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	list := func(t *testing.T, actor *harness.Principal, projectID string, editors ...api.RequestEditorFn) (int, map[string]any) {
		t.Helper()
		res, err := actor.API.ListSecretFoldersWithResponse(t.Context(), &api.ListSecretFoldersParams{
			ProjectId: projectID, Environment: "dev", Path: "/",
		}, editors...)
		require.NoError(t, err)
		body := map[string]any{}
		require.NoErrorf(t, json.Unmarshal(res.Body, &body), "body: %s", res.Body)
		delete(body, "reqId")
		return res.StatusCode(), body
	}

	t.Run("should answer 422 with Node's Zod issues when a query field is invalid", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Any change to a body or status is a regression, so the Go server must reproduce Node's validation failure exactly.`)

		cases := []struct {
			name    string
			editors []api.RequestEditorFn
			issues  []any
		}{
			{"missing projectId", []api.RequestEditorFn{delQuery("projectId")}, []any{required("projectId")}},
			{"missing environment", []api.RequestEditorFn{delQuery("environment")}, []any{required("environment")}},
			{"missing path", []api.RequestEditorFn{delQuery("path")}, []any{required("path")}},
			{"everything missing", []api.RequestEditorFn{delQuery("projectId"), delQuery("environment"), delQuery("path")}, []any{required("projectId"), required("environment"), required("path")}},
			{"lastSecretModified not a date", []api.RequestEditorFn{setQuery("lastSecretModified", "nope")}, []any{invalidDatetime()}},
			{"lastSecretModified with an offset", []api.RequestEditorFn{setQuery("lastSecretModified", "2024-01-01T00:00:00+01:00")}, []any{invalidDatetime()}},
			{"lastSecretModified date only", []api.RequestEditorFn{setQuery("lastSecretModified", "2024-01-01")}, []any{invalidDatetime()}},
			{"lastSecretModified padded", []api.RequestEditorFn{setQuery("lastSecretModified", " 2024-01-01T00:00:00Z ")}, []any{invalidDatetime()}},
			{"lastSecretModified empty", []api.RequestEditorFn{setQuery("lastSecretModified", "")}, []any{invalidDatetime()}},
			{"lastSecretModified month 13", []api.RequestEditorFn{setQuery("lastSecretModified", "2024-13-45T00:00:00Z")}, []any{invalidDatetime()}},
			{"lastSecretModified lowercase", []api.RequestEditorFn{setQuery("lastSecretModified", "2024-01-01t00:00:00z")}, []any{invalidDatetime()}},
			{"issues in schema order", []api.RequestEditorFn{delQuery("path"), setQuery("lastSecretModified", "nope"), delQuery("environment")}, []any{required("environment"), invalidDatetime(), required("path")}},
		}

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))

		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				// Action
				status, body := list(t, proj.Tenant().Admin, proj.ID, tc.editors...)

				// Assert
				require.Equal(t, http.StatusUnprocessableEntity, status)
				require.Equal(t, map[string]any{"statusCode": float64(422), "error": "ValidationFailure", "message": tc.issues}, body)
			})
		}
	})

	t.Run("should accept the datetimes Zod accepts", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))

		for _, value := range []string{"2024-01-01T00:00:00Z", "2024-01-01T00:00:00.123456Z"} {
			// Action
			status, _ := list(t, proj.Tenant().Admin, proj.ID, setQuery("lastSecretModified", value))

			// Assert
			require.Equal(t, http.StatusOK, status, value)
		}
	})

	t.Run("should answer 404 for an empty environment or project id and 200 for an empty path", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		admin := proj.Tenant().Admin

		// Action
		envStatus, envBody := list(t, admin, proj.ID, setQuery("environment", ""))
		projectStatus, _ := list(t, admin, "")
		pathStatus, pathBody := list(t, admin, proj.ID, setQuery("path", ""))

		// Assert
		require.Equal(t, http.StatusNotFound, envStatus)
		require.Equal(t, "Environment with slug '' not found", envBody["message"])
		require.Equal(t, http.StatusNotFound, projectStatus)
		require.Equal(t, http.StatusOK, pathStatus)
		require.Equal(t, map[string]any{"folders": []any{}}, pathBody)
	})

	t.Run("should validate before checking permission, and check permission before the environment", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		outsider := h.NewTenant(t).Admin

		// Action
		invalidStatus, _ := list(t, outsider, proj.ID, setQuery("lastSecretModified", "nope"))
		unknownEnvStatus, _ := list(t, outsider, proj.ID, setQuery("environment", "nope"))

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, invalidStatus)
		require.Equal(t, http.StatusForbidden, unknownEnvStatus)
	})
}
