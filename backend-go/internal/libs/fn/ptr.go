package fn

// ValueOr returns the dereferenced value of ptr if non-nil, otherwise returns def.
func ValueOr[T any](ptr *T, def T) T {
	if ptr == nil {
		return def
	}
	return *ptr
}
