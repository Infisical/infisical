package secret

// AbsoluteSecretRef identifies an absolute reference like ${env.path.KEY}.
type AbsoluteSecretRef struct {
	Env  string
	Path string
	Key  string
}

// CacheKey returns a unique string key for map lookups.
func (r AbsoluteSecretRef) CacheKey() string {
	return r.Env + ":" + r.Path + ":" + r.Key
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
	FetchAbsoluteSecrets func(refs []AbsoluteSecretRef) []*ProcessedSecret
}
