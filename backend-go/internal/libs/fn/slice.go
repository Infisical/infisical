package fn

// AppendUnique appends an item to a slice only if no existing item has the same key.
// Returns the original slice if item already exists, otherwise returns a new slice with the item appended.
func AppendUnique[T any, K comparable](slice []T, item T, key func(T) K) []T {
	itemKey := key(item)
	for i := range slice {
		if key(slice[i]) == itemKey {
			return slice
		}
	}
	return append(slice, item)
}

// AppendUniqueSlice appends all items from src to dst, skipping duplicates by key.
func AppendUniqueSlice[T any, K comparable](dst, src []T, key func(T) K) []T {
	for _, item := range src {
		dst = AppendUnique(dst, item, key)
	}
	return dst
}
