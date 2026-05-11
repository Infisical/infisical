package secret

import "github.com/google/uuid"

// SecretInput represents a secret provided for expansion.
// Secrets should be provided in priority order - first occurrence of each key wins.
type SecretInput struct {
	ID         uuid.UUID
	Key        string
	Value      string
	Env        string
	Path       string
	IsImported bool
}

// ExpandedSecret is the output after expansion - just ID and the fully expanded value.
type ExpandedSecret struct {
	ID            uuid.UUID
	ExpandedValue string
}

// AbsoluteSecretRef identifies an absolute reference like ${env.path.KEY}.
type AbsoluteSecretRef struct {
	Env  string
	Path string
	Key  string
}

// ExpandOpts configures the expansion behavior.
type ExpandOpts struct {
	// CanAccessAbsolute checks if the actor can access an absolute reference.
	// Called before fetching. Return false to deny (ref becomes empty string).
	// If nil, all absolute refs are allowed.
	CanAccessAbsolute func(ref AbsoluteSecretRef) bool

	// FetchAbsoluteSecrets fetches secrets for absolute references.
	// Only called for refs that passed the permission check.
	// If nil, absolute refs resolve to empty string.
	FetchAbsoluteSecrets func(refs []AbsoluteSecretRef) []SecretInput
}
