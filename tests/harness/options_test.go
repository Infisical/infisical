package harness

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCheckInstanceOptions(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		opts []Option
	}{
		{"WithClickHouse", []Option{WithClickHouse()}},
		{"WithInfisicalEnv", []Option{WithInfisicalEnv("KEY", "value")}},
		{"WithInfisicalFile", []Option{WithInfisicalFile("src", "/dst")}},
	}
	for _, tc := range cases {
		t.Run("should refuse "+tc.name+" on a Shared profile", func(t *testing.T) {
			t.Parallel()

			// Setup
			cfg := &config{}
			for _, o := range tc.opts {
				o(cfg)
			}

			// Action
			err := checkInstanceOptions(Shared, cfg)

			// Assert
			require.ErrorContains(t, err, "need harness.Isolated")
		})

		t.Run("should accept "+tc.name+" on an Isolated profile", func(t *testing.T) {
			t.Parallel()

			// Setup
			cfg := &config{}
			for _, o := range tc.opts {
				o(cfg)
			}

			// Action
			err := checkInstanceOptions(Isolated, cfg)

			// Assert
			require.NoError(t, err)
		})
	}
}
