package scim_test

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestScimServiceProviderConfig(t *testing.T) {
	t.Parallel()

	t.Run("should advertise PATCH and filtering and no bulk, sort or etag", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)

		// Action
		r := serviceProviderConfig(t, s.api)

		// Assert
		cfg := decode[struct {
			Patch  struct{ Supported bool } `json:"patch"`
			Filter struct{ Supported bool } `json:"filter"`
			Bulk   struct{ Supported bool } `json:"bulk"`
			Sort   struct{ Supported bool } `json:"sort"`
			Etag   struct{ Supported bool } `json:"etag"`
		}](t, r)
		require.True(t, cfg.Patch.Supported && cfg.Filter.Supported)
		require.False(t, cfg.Bulk.Supported || cfg.Sort.Supported || cfg.Etag.Supported)
	})
}
