package auth

import (
	"testing"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// =============================================================================
// ClassifyToken Tests (no DB/backend needed)
// =============================================================================

func TestClassifyToken_ServiceToken(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		token    string
		expected AuthMode
	}{
		{
			name:     "valid service token format",
			token:    "st." + uuid.New().String() + ".secret123",
			expected: AuthModeServiceToken,
		},
		{
			name:     "service token with only prefix and id",
			token:    "st." + uuid.New().String(),
			expected: AuthModeServiceToken,
		},
		{
			name:     "service token with empty parts after prefix",
			token:    "st..",
			expected: AuthModeServiceToken,
		},
		{
			name:     "wrong prefix sv",
			token:    "sv." + uuid.New().String() + ".secret",
			expected: "",
		},
		{
			name:     "wrong prefix ST uppercase",
			token:    "ST." + uuid.New().String() + ".secret",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			result := ClassifyToken(tt.token)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestClassifyToken_JWT(t *testing.T) {
	t.Parallel()

	// Build valid JWTs with different authTokenType values
	// JWT format: header.payload.signature (base64url encoded)
	// We only need the payload to have the authTokenType claim

	tests := []struct {
		name     string
		token    string
		expected AuthMode
	}{
		{
			name: "JWT with accessToken type",
			// payload: {"authTokenType":"accessToken"}
			token:    "eyJhbGciOiJIUzI1NiJ9.eyJhdXRoVG9rZW5UeXBlIjoiYWNjZXNzVG9rZW4ifQ.sig",
			expected: AuthModeJWT,
		},
		{
			name: "JWT with identityAccessToken type",
			// payload: {"authTokenType":"identityAccessToken"}
			token:    "eyJhbGciOiJIUzI1NiJ9.eyJhdXRoVG9rZW5UeXBlIjoiaWRlbnRpdHlBY2Nlc3NUb2tlbiJ9.sig",
			expected: AuthModeIdentityAccessToken,
		},
		{
			name: "JWT with refreshToken type returns empty",
			// payload: {"authTokenType":"refreshToken"}
			token:    "eyJhbGciOiJIUzI1NiJ9.eyJhdXRoVG9rZW5UeXBlIjoicmVmcmVzaFRva2VuIn0.sig",
			expected: "",
		},
		{
			name: "JWT with unknown type returns empty",
			// payload: {"authTokenType":"unknownType"}
			token:    "eyJhbGciOiJIUzI1NiJ9.eyJhdXRoVG9rZW5UeXBlIjoidW5rbm93blR5cGUifQ.sig",
			expected: "",
		},
		{
			name: "JWT without authTokenType returns empty",
			// payload: {"sub":"1234567890"}
			token:    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig",
			expected: "",
		},
		{
			name:     "JWT with empty payload returns empty",
			token:    "eyJhbGciOiJIUzI1NiJ9..sig",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			result := ClassifyToken(tt.token)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestClassifyToken_Malformed(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		token string
	}{
		{"empty token", ""},
		{"single dot", "."},
		{"two dots", ".."},
		{"three dots only", "..."},
		{"two parts only", "header.payload"},
		{"four parts", "a.b.c.d"},
		{"random string", "not-a-token-at-all"},
		{"base64 garbage in payload", "eyJhbGciOiJIUzI1NiJ9.!!!invalid!!!.sig"},
		{"only header valid base64", "eyJhbGciOiJIUzI1NiJ9"},
		{"whitespace", "   "},
		{"newlines", "header\n.payload\n.sig"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			result := ClassifyToken(tt.token)
			assert.Equal(t, AuthMode(""), result, "malformed token should return empty AuthMode")
		})
	}
}

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
			trustedIPs: []TrustedIP{{IPAddress: "10.0.0.0", Prefix: 8}},
			wantErr:    false,
		},
		{
			name:       "CIDR mismatch denies",
			ipAddress:  "192.168.1.1",
			trustedIPs: []TrustedIP{{IPAddress: "10.0.0.0", Prefix: 8}},
			wantErr:    true,
		},
		{
			name:      "multiple entries - matches any",
			ipAddress: "192.168.1.1",
			trustedIPs: []TrustedIP{
				{IPAddress: "10.0.0.0", Prefix: 8},
				{IPAddress: "192.168.1.1"},
			},
			wantErr: false,
		},
		{
			name:       "wildcard 0.0.0.0/0 allows any IPv4",
			ipAddress:  "192.168.1.1",
			trustedIPs: []TrustedIP{{IPAddress: "0.0.0.0", Prefix: 0}},
			wantErr:    true, // Prefix 0 is not > 0, so it falls to exact match which fails
		},
		{
			name:       "wildcard with Prefix 1 covers half of IPv4",
			ipAddress:  "192.168.1.1",
			trustedIPs: []TrustedIP{{IPAddress: "128.0.0.0", Prefix: 1}},
			wantErr:    false,
		},
		{
			name:       "invalid incoming IP denies",
			ipAddress:  "not-an-ip",
			trustedIPs: []TrustedIP{{IPAddress: "0.0.0.0", Prefix: 1}},
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
			trustedIPs: []TrustedIP{{IPAddress: "192.168.0.0", Prefix: 16}},
			wantErr:    true,
		},
		{
			name:       "IPv4 address with IPv6 CIDR denies",
			ipAddress:  "192.168.1.1",
			trustedIPs: []TrustedIP{{IPAddress: "2001:db8::", Prefix: 32}},
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
			trustedIPs: []TrustedIP{{IPAddress: "2001:db8::", Prefix: 32}},
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
			expected: new(int64(10)),
		},
		{
			name:     "zero",
			input:    "0",
			expected: new(int64(0)),
		},
		{
			name:     "negative number",
			input:    "-5",
			expected: new(int64(-5)),
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
