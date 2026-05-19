package sqln

// Grouper defines how to group and merge rows by a key.
// Used to transform flat LEFT JOIN results into nested structures.
type Grouper[T any, K comparable] struct {
	// Key extracts the grouping key from a row (typically the primary key).
	Key func(*T) K
	// Merge combines data from a duplicate row into the existing row.
	// Called when a row with the same key is encountered.
	Merge func(existing *T, row *T)
}

// GroupRows groups flat rows by key and merges duplicates.
// Preserves the order of first occurrence for each unique key.
//
// Example usage for LEFT JOIN with tags:
//
//	grouper := sqln.Grouper[Secret, uuid.UUID]{
//	    Key: func(s *Secret) uuid.UUID { return s.ID },
//	    Merge: func(existing, row *Secret) {
//	        if len(row.Tags) > 0 {
//	            existing.Tags = fn.AppendUnique(existing.Tags, row.Tags[0], func(t SecretTag) uuid.UUID { return t.ID })
//	        }
//	    },
//	}
//	secrets := sqln.GroupRows(flatSecrets, grouper)
func GroupRows[T any, K comparable](rows []T, g Grouper[T, K]) []T {
	if len(rows) == 0 {
		return rows
	}

	result := make(map[K]*T, len(rows))
	order := make([]K, 0, len(rows))

	for i := range rows {
		key := g.Key(&rows[i])
		if existing, ok := result[key]; ok {
			g.Merge(existing, &rows[i])
		} else {
			rowCopy := rows[i]
			result[key] = &rowCopy
			order = append(order, key)
		}
	}

	out := make([]T, 0, len(order))
	for _, k := range order {
		out = append(out, *result[k])
	}
	return out
}
