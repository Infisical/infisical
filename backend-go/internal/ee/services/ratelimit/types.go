package ratelimit

// Preset identifies which rate limit to apply.
type Preset int

const (
	PresetRead Preset = iota
	PresetWrite
	PresetSecrets
	PresetAuth
	PresetMfa
	PresetPublicEndpoint
	PresetInviteUser
	PresetIdentityCreation
	PresetProjectCreation
)

// Limits holds rate limits for a request.
type Limits struct {
	ReadLimit             int
	WriteLimit            int
	SecretsLimit          int
	AuthRateLimit         int
	MfaRateLimit          int
	PublicEndpointLimit   int
	InviteUserRateLimit   int
	IdentityCreationLimit int
	ProjectCreationLimit  int
}

// DefaultLimits are the instance-wide defaults (matching Node.js).
var DefaultLimits = Limits{
	ReadLimit:             600,
	WriteLimit:            200,
	SecretsLimit:          60,
	AuthRateLimit:         60,
	MfaRateLimit:          20,
	PublicEndpointLimit:   30,
	InviteUserRateLimit:   30,
	IdentityCreationLimit: 30,
	ProjectCreationLimit:  30,
}

// Get returns the limit value for a given preset.
func (l Limits) Get(preset Preset) int {
	switch preset {
	case PresetRead:
		return l.ReadLimit
	case PresetWrite:
		return l.WriteLimit
	case PresetSecrets:
		return l.SecretsLimit
	case PresetAuth:
		return l.AuthRateLimit
	case PresetMfa:
		return l.MfaRateLimit
	case PresetPublicEndpoint:
		return l.PublicEndpointLimit
	case PresetInviteUser:
		return l.InviteUserRateLimit
	case PresetIdentityCreation:
		return l.IdentityCreationLimit
	case PresetProjectCreation:
		return l.ProjectCreationLimit
	default:
		return DefaultLimits.ReadLimit
	}
}
