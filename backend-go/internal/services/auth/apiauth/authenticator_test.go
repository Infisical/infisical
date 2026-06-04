package apiauth

import (
	"database/sql"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// =============================================================================
// ParseTrustedIPs Tests (no DB needed)
// =============================================================================

func TestParseTrustedIPs_ValidJSON(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		input    string
		expected []TrustedIP
		wantErr  bool
	}{
		{
			name:     "empty string returns nil",
			input:    "",
			expected: nil,
			wantErr:  false,
		},
		{
			name:  "single IP",
			input: `[{"ipAddress":"192.168.1.1"}]`,
			expected: []TrustedIP{
				{IPAddress: "192.168.1.1"},
			},
			wantErr: false,
		},
		{
			name:  "multiple IPs",
			input: `[{"ipAddress":"192.168.1.1"},{"ipAddress":"10.0.0.0/8"}]`,
			expected: []TrustedIP{
				{IPAddress: "192.168.1.1"},
				{IPAddress: "10.0.0.0/8"},
			},
			wantErr: false,
		},
		{
			name:  "wildcard IPs",
			input: `[{"ipAddress":"0.0.0.0/0"},{"ipAddress":"::/0"}]`,
			expected: []TrustedIP{
				{IPAddress: "0.0.0.0/0"},
				{IPAddress: "::/0"},
			},
			wantErr: false,
		},
		{
			name:     "empty array",
			input:    `[]`,
			expected: []TrustedIP{},
			wantErr:  false,
		},
		{
			name:     "invalid JSON",
			input:    `{not valid json}`,
			expected: nil,
			wantErr:  true,
		},
		{
			name:     "wrong JSON structure",
			input:    `{"ipAddress":"192.168.1.1"}`,
			expected: nil,
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			result, err := parseTrustedIPs(tt.input)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, result)
			}
		})
	}
}

// =============================================================================
// CheckIPAgainstBlocklist Tests (no DB needed)
// =============================================================================

func TestCheckIPAgainstBlocklist(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		ipAddress  string
		trustedIPs []TrustedIP
		wantErr    bool
	}{
		{
			name:       "empty list allows all",
			ipAddress:  "192.168.1.1",
			trustedIPs: []TrustedIP{},
			wantErr:    false,
		},
		{
			name:       "nil list allows all",
			ipAddress:  "192.168.1.1",
			trustedIPs: nil,
			wantErr:    false,
		},
		{
			name:       "exact IP match allows",
			ipAddress:  "192.168.1.1",
			trustedIPs: []TrustedIP{{IPAddress: "192.168.1.1"}},
			wantErr:    false,
		},
		{
			name:       "exact IP mismatch denies",
			ipAddress:  "192.168.1.2",
			trustedIPs: []TrustedIP{{IPAddress: "192.168.1.1"}},
			wantErr:    true,
		},
		{
			name:       "CIDR match allows (Prefix field set)",
			ipAddress:  "10.0.5.100",
			trustedIPs: []TrustedIP{{IPAddress: "10.0.0.0", Prefix: new(8)}},
			wantErr:    false,
		},
		{
			name:       "CIDR mismatch denies",
			ipAddress:  "192.168.1.1",
			trustedIPs: []TrustedIP{{IPAddress: "10.0.0.0", Prefix: new(8)}},
			wantErr:    true,
		},
		{
			name:      "multiple entries - matches any",
			ipAddress: "192.168.1.1",
			trustedIPs: []TrustedIP{
				{IPAddress: "10.0.0.0", Prefix: new(8)},
				{IPAddress: "192.168.1.1"},
			},
			wantErr: false,
		},
		{
			name:       "wildcard 0.0.0.0/0 allows any IPv4",
			ipAddress:  "192.168.1.1",
			trustedIPs: []TrustedIP{{IPAddress: "0.0.0.0", Prefix: new(0)}},
			wantErr:    false,
		},
		{
			name:       "wildcard with Prefix 1 covers half of IPv4",
			ipAddress:  "192.168.1.1",
			trustedIPs: []TrustedIP{{IPAddress: "128.0.0.0", Prefix: new(1)}},
			wantErr:    false,
		},
		{
			name:       "invalid incoming IP denies",
			ipAddress:  "not-an-ip",
			trustedIPs: []TrustedIP{{IPAddress: "0.0.0.0", Prefix: new(1)}},
			wantErr:    true,
		},
		{
			name:       "invalid trusted IP format skipped",
			ipAddress:  "192.168.1.1",
			trustedIPs: []TrustedIP{{IPAddress: "invalid-cidr"}},
			wantErr:    true,
		},
		{
			name:       "IPv6 address with IPv4 CIDR denies",
			ipAddress:  "2001:db8::1",
			trustedIPs: []TrustedIP{{IPAddress: "192.168.0.0", Prefix: new(16)}},
			wantErr:    true,
		},
		{
			name:       "IPv4 address with IPv6 CIDR denies",
			ipAddress:  "192.168.1.1",
			trustedIPs: []TrustedIP{{IPAddress: "2001:db8::", Prefix: new(32)}},
			wantErr:    true,
		},
		{
			name:       "IPv6 exact match allows",
			ipAddress:  "2001:db8::1",
			trustedIPs: []TrustedIP{{IPAddress: "2001:db8::1"}},
			wantErr:    false,
		},
		{
			name:       "IPv6 CIDR match allows",
			ipAddress:  "2001:db8::1",
			trustedIPs: []TrustedIP{{IPAddress: "2001:db8::", Prefix: new(32)}},
			wantErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := checkIPAgainstBlocklist(tt.ipAddress, tt.trustedIPs)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// =============================================================================
// HasFullRenewClaims Tests (no DB needed)
// =============================================================================

func TestIdentityJWTClaims_HasFullRenewClaims(t *testing.T) {
	t.Parallel()

	validUUID := uuid.New()

	tests := []struct {
		name     string
		claims   IdentityJWTClaims
		expected bool
	}{
		{
			name: "all claims present - TTL mode",
			claims: IdentityJWTClaims{
				RegisteredClaims: RegisteredClaimsWithJTI("token-id"),
				OrgID:            validUUID,
				RootOrgID:        validUUID,
				ParentOrgID:      validUUID,
				AuthMethod:       "universal",
				AccessTokenTTL:   3600,
			},
			expected: true,
		},
		{
			name: "all claims present - MaxTTL mode",
			claims: IdentityJWTClaims{
				RegisteredClaims:  RegisteredClaimsWithJTI("token-id"),
				OrgID:             validUUID,
				RootOrgID:         validUUID,
				ParentOrgID:       validUUID,
				AuthMethod:        "universal",
				AccessTokenMaxTTL: 7200,
			},
			expected: true,
		},
		{
			name: "all claims present - Period mode",
			claims: IdentityJWTClaims{
				RegisteredClaims:  RegisteredClaimsWithJTI("token-id"),
				OrgID:             validUUID,
				RootOrgID:         validUUID,
				ParentOrgID:       validUUID,
				AuthMethod:        "universal",
				AccessTokenPeriod: 86400,
			},
			expected: true,
		},
		{
			name: "missing jti",
			claims: IdentityJWTClaims{
				OrgID:          validUUID,
				RootOrgID:      validUUID,
				ParentOrgID:    validUUID,
				AuthMethod:     "universal",
				AccessTokenTTL: 3600,
			},
			expected: false,
		},
		{
			name: "missing orgId",
			claims: IdentityJWTClaims{
				RegisteredClaims: RegisteredClaimsWithJTI("token-id"),
				RootOrgID:        validUUID,
				ParentOrgID:      validUUID,
				AuthMethod:       "universal",
				AccessTokenTTL:   3600,
			},
			expected: false,
		},
		{
			name: "missing authMethod",
			claims: IdentityJWTClaims{
				RegisteredClaims: RegisteredClaimsWithJTI("token-id"),
				OrgID:            validUUID,
				RootOrgID:        validUUID,
				ParentOrgID:      validUUID,
				AccessTokenTTL:   3600,
			},
			expected: false,
		},
		{
			name: "no TTL fields set",
			claims: IdentityJWTClaims{
				RegisteredClaims: RegisteredClaimsWithJTI("token-id"),
				OrgID:            validUUID,
				RootOrgID:        validUUID,
				ParentOrgID:      validUUID,
				AuthMethod:       "universal",
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			result := tt.claims.HasFullRenewClaims()
			assert.Equal(t, tt.expected, result)
		})
	}
}

// RegisteredClaimsWithJTI is a helper to create RegisteredClaims with a JTI.
func RegisteredClaimsWithJTI(jti string) jwt.RegisteredClaims {
	return jwt.RegisteredClaims{
		ID: jti,
	}
}

// =============================================================================
// parseUsesRemaining Tests (no DB needed)
// =============================================================================

func TestParseUsesRemaining(t *testing.T) {
	t.Parallel()

	ten := int64(10)
	zero := int64(0)
	negFive := int64(-5)

	tests := []struct {
		name     string
		input    string
		expected *int64
	}{
		{
			name:     "empty string returns nil",
			input:    "",
			expected: nil,
		},
		{
			name:     "valid positive number",
			input:    "10",
			expected: &ten,
		},
		{
			name:     "zero",
			input:    "0",
			expected: &zero,
		},
		{
			name:     "negative number",
			input:    "-5",
			expected: &negFive,
		},
		{
			name:     "non-numeric returns nil",
			input:    "not-a-number",
			expected: nil,
		},
		{
			name:     "float string returns nil",
			input:    "10.5",
			expected: nil,
		},
		{
			name:     "whitespace returns nil",
			input:    "  ",
			expected: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			result := parseUsesRemaining(tt.input)
			if tt.expected == nil {
				assert.Nil(t, result)
			} else {
				assert.NotNil(t, result)
				assert.Equal(t, *tt.expected, *result)
			}
		})
	}
}

// =============================================================================
// identityTokenUsesRemainingKey Tests (no DB needed)
// =============================================================================

func TestIdentityTokenUsesRemainingKey(t *testing.T) {
	t.Parallel()

	identityID := "identity-123"
	tokenID := "token-456"

	result := identityTokenUsesRemainingKey(identityID, tokenID)

	assert.Equal(t, "identity-token-uses-remaining:identity-123:token-456", result)
}

// =============================================================================
// validateLegacyAccessTokenConstraints Tests (no DB needed)
// =============================================================================

func TestValidateLegacyAccessTokenConstraints(t *testing.T) {
	t.Parallel()

	now := time.Now()

	tests := []struct {
		name        string
		token       *identityAccessTokenRow
		expectError bool
		errorMsg    string
	}{
		{
			name: "valid token - all constraints pass",
			token: &identityAccessTokenRow{
				CreatedAt:                sql.Null[time.Time]{Valid: true, V: now.Add(-1 * time.Minute)},
				AccessTokenLastRenewedAt: sql.Null[time.Time]{Valid: true, V: now.Add(-30 * time.Second)},
				AccessTokenTTL:           3600,
				AccessTokenMaxTTL:        7200,
				AccessTokenNumUses:       1,
				AccessTokenNumUsesLimit:  10,
			},
			expectError: false,
		},
		{
			name: "expired TTL",
			token: &identityAccessTokenRow{
				CreatedAt:                sql.Null[time.Time]{Valid: true, V: now.Add(-2 * time.Hour)},
				AccessTokenLastRenewedAt: sql.Null[time.Time]{Valid: true, V: now.Add(-2 * time.Hour)},
				AccessTokenTTL:           3600, // 1 hour TTL, but 2 hours have passed
				AccessTokenMaxTTL:        0,
				AccessTokenNumUsesLimit:  0,
			},
			expectError: true,
			errorMsg:    "TTL expired",
		},
		{
			name: "expired maxTTL",
			token: &identityAccessTokenRow{
				CreatedAt:                sql.Null[time.Time]{Valid: true, V: now.Add(-3 * time.Hour)},
				AccessTokenLastRenewedAt: sql.Null[time.Time]{Valid: true, V: now.Add(-1 * time.Minute)},
				AccessTokenTTL:           3600,
				AccessTokenMaxTTL:        7200, // 2 hour max TTL, but 3 hours since creation
				AccessTokenNumUsesLimit:  0,
			},
			expectError: true,
			errorMsg:    "max TTL expired",
		},
		{
			name: "usage limit reached",
			token: &identityAccessTokenRow{
				CreatedAt:               sql.Null[time.Time]{Valid: true, V: now.Add(-1 * time.Minute)},
				AccessTokenTTL:          3600,
				AccessTokenMaxTTL:       0,
				AccessTokenNumUses:      5,
				AccessTokenNumUsesLimit: 5, // limit reached
			},
			expectError: true,
			errorMsg:    "usage limit reached",
		},
		{
			name: "usage limit exceeded",
			token: &identityAccessTokenRow{
				CreatedAt:               sql.Null[time.Time]{Valid: true, V: now.Add(-1 * time.Minute)},
				AccessTokenTTL:          0,
				AccessTokenMaxTTL:       0,
				AccessTokenNumUses:      10,
				AccessTokenNumUsesLimit: 5, // already exceeded
			},
			expectError: true,
			errorMsg:    "usage limit reached",
		},
		{
			name: "no constraints - always valid",
			token: &identityAccessTokenRow{
				CreatedAt:               sql.Null[time.Time]{Valid: true, V: now.Add(-24 * time.Hour)},
				AccessTokenTTL:          0,
				AccessTokenMaxTTL:       0,
				AccessTokenNumUsesLimit: 0,
			},
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := validateLegacyAccessTokenConstraints(tt.token, now)
			if tt.expectError {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorMsg)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
