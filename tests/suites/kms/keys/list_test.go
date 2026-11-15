package keys_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestKmsKey_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list only this project's customer keys, including disabled keys", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj, other := newProject(t, tn), newProject(t, tn)
		kms.NewKey(t, proj, kms.WithName("active"))
		disabled := kms.NewKey(t, proj, kms.WithName("disabled"), kms.WithUsage(kms.MAC), kms.WithAlgorithm("HMAC_SHA_256"))
		setDisabled(t, proj, disabled.ID, true)
		kms.NewKey(t, other, kms.WithName("elsewhere"))

		// Action
		page := listKeys(t, tn.Admin.API, api.ListKmsKeysParams{ProjectId: proj.ID})

		// Assert
		require.Equal(t, []string{"active", "disabled"}, names(page.Keys))
		require.Equal(t, 2, page.TotalCount)
		for _, k := range page.Keys {
			require.Equal(t, k.Name == "disabled", k.IsDisabled, k.Name)
		}
	})

	t.Run("should page with the full total count, including on a page past the last key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		for _, name := range []string{"a-key", "b-key", "c-key"} {
			kms.NewKey(t, proj, kms.WithName(name))
		}
		page := func(offset float32) keyPage {
			return listKeys(t, tn.Admin.API, api.ListKmsKeysParams{ProjectId: proj.ID, Offset: new(offset), Limit: new(float32(2))})
		}

		// Action
		first, second, past := page(0), page(2), page(5)

		// Assert
		require.Equal(t, []string{"a-key", "b-key"}, names(first.Keys))
		require.Equal(t, []string{"c-key"}, names(second.Keys))
		require.Empty(t, past.Keys)
		require.Equal(t, []int{3, 3, 3}, []int{first.TotalCount, second.TotalCount, past.TotalCount})
	})

	t.Run("should find keys by a case-insensitive partial name, and match % and _ literally", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		for _, name := range []string{"alpha-one", "alpha-two", "beta"} {
			kms.NewKey(t, proj, kms.WithName(name))
		}
		search := func(term string) keyPage {
			return listKeys(t, tn.Admin.API, api.ListKmsKeysParams{ProjectId: proj.ID, Search: new(term)})
		}

		// Action
		alpha, percent, underscore := search("ALPHA"), search("%"), search("_")

		// Assert
		require.Equal(t, []string{"alpha-one", "alpha-two"}, names(alpha.Keys))
		require.Equal(t, 2, alpha.TotalCount)
		require.Empty(t, percent.Keys)
		require.Empty(t, underscore.Keys)
	})

	t.Run("should order by name descending when asked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		for _, name := range []string{"b-key", "a-key", "c-key"} {
			kms.NewKey(t, proj, kms.WithName(name))
		}

		// Action
		page := listKeys(t, tn.Admin.API, api.ListKmsKeysParams{
			ProjectId: proj.ID, OrderDirection: new(api.ListKmsKeysParamsOrderDirectionDesc),
		})

		// Assert
		got := make([]string, 0, len(page.Keys))
		for _, k := range page.Keys {
			got = append(got, k.Name)
		}
		require.Equal(t, []string{"c-key", "b-key", "a-key"}, got)
	})
}
