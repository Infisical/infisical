package ratelimit

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestLimits_Get_ReturnsCorrectLimitForEachPreset(t *testing.T) {
	t.Parallel()

	limits := Limits{
		ReadLimit:             100,
		WriteLimit:            50,
		SecretsLimit:          25,
		AuthRateLimit:         10,
		MfaRateLimit:          5,
		PublicEndpointLimit:   15,
		InviteUserRateLimit:   8,
		IdentityCreationLimit: 12,
		ProjectCreationLimit:  6,
	}

	tests := []struct {
		name     string
		preset   Preset
		expected int
	}{
		{
			name:     "read preset returns ReadLimit",
			preset:   PresetRead,
			expected: 100,
		},
		{
			name:     "write preset returns WriteLimit",
			preset:   PresetWrite,
			expected: 50,
		},
		{
			name:     "secrets preset returns SecretsLimit",
			preset:   PresetSecrets,
			expected: 25,
		},
		{
			name:     "auth preset returns AuthRateLimit",
			preset:   PresetAuth,
			expected: 10,
		},
		{
			name:     "mfa preset returns MfaRateLimit",
			preset:   PresetMfa,
			expected: 5,
		},
		{
			name:     "public endpoint preset returns PublicEndpointLimit",
			preset:   PresetPublicEndpoint,
			expected: 15,
		},
		{
			name:     "invite user preset returns InviteUserRateLimit",
			preset:   PresetInviteUser,
			expected: 8,
		},
		{
			name:     "identity creation preset returns IdentityCreationLimit",
			preset:   PresetIdentityCreation,
			expected: 12,
		},
		{
			name:     "project creation preset returns ProjectCreationLimit",
			preset:   PresetProjectCreation,
			expected: 6,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			result := limits.Get(tc.preset)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestLimits_Get_ReturnsDefaultReadLimitForUnknownPreset(t *testing.T) {
	t.Parallel()

	limits := Limits{
		ReadLimit:  999,
		WriteLimit: 100,
	}

	unknownPreset := Preset(999)
	result := limits.Get(unknownPreset)

	assert.Equal(t, DefaultLimits.ReadLimit, result)
}
