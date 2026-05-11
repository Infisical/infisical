package secret

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func newUUID() uuid.UUID {
	return uuid.New()
}

func TestExpand_SimpleRelativeReference(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "hello", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "B", Value: "${A} world", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Len(t, results, 2)
	assert.Equal(t, "hello", results[0].ExpandedValue)
	assert.Equal(t, "hello world", results[1].ExpandedValue)
}

func TestExpand_ChainedRelativeReferences(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "base", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "B", Value: "${A}-middle", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "C", Value: "${B}-end", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "base", results[0].ExpandedValue)
	assert.Equal(t, "base-middle", results[1].ExpandedValue)
	assert.Equal(t, "base-middle-end", results[2].ExpandedValue)
}

func TestExpand_ImportFallback_CurrentBoardFirst(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "DB_HOST", Value: "current-db.local", Env: "dev", Path: "/", IsImported: false},
		{ID: newUUID(), Key: "DB_HOST", Value: "imported-db.local", Env: "staging", Path: "/", IsImported: true},
		{ID: newUUID(), Key: "CONNECTION", Value: "host=${DB_HOST}", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "host=current-db.local", results[2].ExpandedValue)
}

func TestExpand_ImportFallback_FallsBackToImport(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "LOCAL_KEY", Value: "local-value", Env: "dev", Path: "/", IsImported: false},
		{ID: newUUID(), Key: "IMPORT_ONLY", Value: "from-import", Env: "staging", Path: "/", IsImported: true},
		{ID: newUUID(), Key: "USES_IMPORT", Value: "got=${IMPORT_ONLY}", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "got=from-import", results[2].ExpandedValue)
}

func TestExpand_ImportOrder_FirstImportWins(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "USE_IT", Value: "val=${SHARED_KEY}", Env: "dev", Path: "/", IsImported: false},
		{ID: newUUID(), Key: "SHARED_KEY", Value: "from-import-1", Env: "staging", Path: "/", IsImported: true},
		{ID: newUUID(), Key: "SHARED_KEY", Value: "from-import-2", Env: "prod", Path: "/", IsImported: true},
		{ID: newUUID(), Key: "SHARED_KEY", Value: "from-import-3", Env: "qa", Path: "/", IsImported: true},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "val=from-import-1", results[0].ExpandedValue)
}

func TestExpand_ImportOrder_NestedImportOrder(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "USE_KEY", Value: "result=${NESTED_KEY}", Env: "dev", Path: "/", IsImported: false},
		{ID: newUUID(), Key: "NESTED_KEY", Value: "staging-value", Env: "staging", Path: "/", IsImported: true},
		{ID: newUUID(), Key: "NESTED_KEY", Value: "prod-value", Env: "prod", Path: "/", IsImported: true},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "result=staging-value", results[0].ExpandedValue)
}

func TestExpand_DuplicateKeysInCurrentBoard(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "DUP", Value: "first", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "DUP", Value: "second", Env: "dev", Path: "/sub"},
		{ID: newUUID(), Key: "USE_DUP", Value: "got=${DUP}", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "got=first", results[2].ExpandedValue)
}

func TestExpand_MissingReference_EmptyString(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "before-${MISSING}-after", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "before--after", results[0].ExpandedValue)
}

func TestExpand_AbsoluteReference_Simple(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "use=${prod.secrets.API_KEY}", Env: "dev", Path: "/"},
	}

	fetchCalled := false
	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
			fetchCalled = true
			assert.Len(t, refs, 1)
			assert.Equal(t, "prod", refs[0].Env)
			assert.Equal(t, "/secrets", refs[0].Path)
			assert.Equal(t, "API_KEY", refs[0].Key)

			return []SecretInput{
				{ID: newUUID(), Key: "API_KEY", Value: "secret-123", Env: "prod", Path: "/secrets"},
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()
	results := expander.Secrets()

	assert.True(t, fetchCalled)
	assert.Equal(t, "use=secret-123", results[0].ExpandedValue)
}

func TestExpand_AbsoluteReference_RootPath(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "${prod.ROOT_KEY}", Env: "dev", Path: "/"},
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
			assert.Equal(t, "/", refs[0].Path)
			return []SecretInput{
				{ID: newUUID(), Key: "ROOT_KEY", Value: "root-value", Env: "prod", Path: "/"},
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "root-value", results[0].ExpandedValue)
}

func TestExpand_AbsoluteReference_DeepPath(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "${prod.level1.level2.level3.DEEP_KEY}", Env: "dev", Path: "/"},
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
			assert.Equal(t, "/level1/level2/level3", refs[0].Path)
			return []SecretInput{
				{ID: newUUID(), Key: "DEEP_KEY", Value: "deep-value", Env: "prod", Path: "/level1/level2/level3"},
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "deep-value", results[0].ExpandedValue)
}

func TestExpand_AbsoluteReference_WithNestedRelative(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "LOCAL_VAR", Value: "local-resolved", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "A", Value: "${prod.USES_LOCAL}", Env: "dev", Path: "/"},
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
			return []SecretInput{
				{ID: newUUID(), Key: "USES_LOCAL", Value: "prefix-${LOCAL_VAR}-suffix", Env: "prod", Path: "/"},
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "prefix-local-resolved-suffix", results[1].ExpandedValue)
}

func TestExpand_AbsoluteReference_ChainedAbsolute(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "${prod.KEY1}", Env: "dev", Path: "/"},
	}

	fetchCount := 0
	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
			fetchCount++
			if fetchCount == 1 {
				assert.Equal(t, "KEY1", refs[0].Key)
				return []SecretInput{
					{ID: newUUID(), Key: "KEY1", Value: "${staging.KEY2}", Env: "prod", Path: "/"},
				}
			}
			if fetchCount == 2 {
				assert.Equal(t, "KEY2", refs[0].Key)
				return []SecretInput{
					{ID: newUUID(), Key: "KEY2", Value: "final-value", Env: "staging", Path: "/"},
				}
			}
			return nil
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, 2, fetchCount)
	assert.Equal(t, "final-value", results[0].ExpandedValue)
}

func TestExpand_AbsoluteReference_PermissionDenied(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "allowed=${prod.ALLOWED} denied=${prod.DENIED}", Env: "dev", Path: "/"},
	}

	opts := ExpandOpts{
		CanAccessAbsolute: func(ref AbsoluteSecretRef) bool {
			return ref.Key == "ALLOWED"
		},
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
			assert.Len(t, refs, 1)
			assert.Equal(t, "ALLOWED", refs[0].Key)
			return []SecretInput{
				{ID: newUUID(), Key: "ALLOWED", Value: "yes", Env: "prod", Path: "/"},
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "allowed=yes denied=", results[0].ExpandedValue)
}

func TestExpand_CircularReference_Direct(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "${B}", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "B", Value: "${A}", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "", results[0].ExpandedValue)
	assert.Equal(t, "", results[1].ExpandedValue)
}

func TestExpand_CircularReference_SelfReference(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "prefix-${A}-suffix", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "prefix-prefix--suffix-suffix", results[0].ExpandedValue)
}

func TestExpand_CircularReference_ThreeWay(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "${B}", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "B", Value: "${C}", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "C", Value: "${A}", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "", results[0].ExpandedValue)
	assert.Equal(t, "", results[1].ExpandedValue)
	assert.Equal(t, "", results[2].ExpandedValue)
}

func TestExpand_MaxDepth(t *testing.T) {
	secrets := make([]SecretInput, 15)
	for i := range 15 {
		key := string(rune('A' + i))
		var value string
		if i < 14 {
			nextKey := string(rune('A' + i + 1))
			value = "level" + key + "-${" + nextKey + "}"
		} else {
			value = "end"
		}
		secrets[i] = SecretInput{ID: newUUID(), Key: key, Value: value, Env: "dev", Path: "/"}
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Contains(t, results[0].ExpandedValue, "levelA-")
}

func TestExpand_MultipleReferencesInSingleValue(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "HOST", Value: "localhost", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "PORT", Value: "5432", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "USER", Value: "admin", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "CONN", Value: "postgresql://${USER}@${HOST}:${PORT}/db", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "postgresql://admin@localhost:5432/db", results[3].ExpandedValue)
}

func TestExpand_MixedRelativeAndAbsolute(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "LOCAL_HOST", Value: "dev-host", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "CONN", Value: "local=${LOCAL_HOST} prod=${prod.PROD_HOST}", Env: "dev", Path: "/"},
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
			return []SecretInput{
				{ID: newUUID(), Key: "PROD_HOST", Value: "prod-host", Env: "prod", Path: "/"},
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "local=dev-host prod=prod-host", results[1].ExpandedValue)
}

func TestExpand_NoReferences(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "PLAIN", Value: "just a plain value", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "ANOTHER", Value: "no references here", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "just a plain value", results[0].ExpandedValue)
	assert.Equal(t, "no references here", results[1].ExpandedValue)
}

func TestExpand_EmptySecretsList(t *testing.T) {
	secrets := []SecretInput{}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Empty(t, results)
}

func TestExpand_EmptyValue(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "EMPTY", Value: "", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "", results[0].ExpandedValue)
}

func TestExpand_PreservesOrder(t *testing.T) {
	id1, id2, id3 := newUUID(), newUUID(), newUUID()
	secrets := []SecretInput{
		{ID: id1, Key: "FIRST", Value: "1", Env: "dev", Path: "/"},
		{ID: id2, Key: "SECOND", Value: "2", Env: "dev", Path: "/"},
		{ID: id3, Key: "THIRD", Value: "3", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, id1, results[0].ID)
	assert.Equal(t, id2, results[1].ID)
	assert.Equal(t, id3, results[2].ID)
}

func TestExpand_AbsoluteFetchNotCalledWhenNotNeeded(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "${B}", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "B", Value: "local", Env: "dev", Path: "/"},
	}

	fetchCalled := false
	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
			fetchCalled = true
			return nil
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()
	results := expander.Secrets()

	assert.False(t, fetchCalled)
	assert.Equal(t, "local", results[0].ExpandedValue)
}

func TestExpand_BatchesFetchRequests(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "${prod.X} ${prod.Y} ${staging.Z}", Env: "dev", Path: "/"},
	}

	fetchCount := 0
	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
			fetchCount++
			assert.Len(t, refs, 3)
			return []SecretInput{
				{ID: newUUID(), Key: "X", Value: "x-val", Env: "prod", Path: "/"},
				{ID: newUUID(), Key: "Y", Value: "y-val", Env: "prod", Path: "/"},
				{ID: newUUID(), Key: "Z", Value: "z-val", Env: "staging", Path: "/"},
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, 1, fetchCount)
	assert.Equal(t, "x-val y-val z-val", results[0].ExpandedValue)
}

func TestExpand_ImportedSecretReferencesLocalKey(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "KEY", Value: "current-board-value", Env: "dev", Path: "/", IsImported: false},
		{ID: newUUID(), Key: "IMPORTED", Value: "uses ${KEY}", Env: "staging", Path: "/", IsImported: true},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "uses current-board-value", results[1].ExpandedValue)
}

func TestExpand_SpecialCharactersInValues(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "SPECIAL", Value: "has$pecial&chars=yes", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "USE", Value: "val=${SPECIAL}", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "val=has$pecial&chars=yes", results[1].ExpandedValue)
}

func TestExpand_ReferenceKeyWithHyphensAndUnderscores(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "my-key_name", Value: "special-key-value", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "USE", Value: "${my-key_name}", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "special-key-value", results[1].ExpandedValue)
}

func TestExpand_AbsoluteRefNotFound(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "prefix-${prod.NONEXISTENT}-suffix", Env: "dev", Path: "/"},
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
			return []SecretInput{}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "prefix--suffix", results[0].ExpandedValue)
}

func TestExpand_NilCallbacks(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "${prod.X}", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "", results[0].ExpandedValue)
}

func TestExpand_AbsoluteReference_TwoLevelPath(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "A", Value: "${prod.folder1.DB_PASSWORD}", Env: "dev", Path: "/"},
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
			assert.Len(t, refs, 1)
			assert.Equal(t, "prod", refs[0].Env)
			assert.Equal(t, "/folder1", refs[0].Path)
			assert.Equal(t, "DB_PASSWORD", refs[0].Key)

			return []SecretInput{
				{ID: newUUID(), Key: "DB_PASSWORD", Value: "super-secret", Env: "prod", Path: "/folder1"},
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "super-secret", results[0].ExpandedValue)
}

func TestExpand_AbsoluteReference_MultipleDeepPaths(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "CONN", Value: "host=${prod.db.config.HOST} port=${prod.db.config.PORT} user=${staging.auth.USER}", Env: "dev", Path: "/"},
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
			assert.Len(t, refs, 3)

			return []SecretInput{
				{ID: newUUID(), Key: "HOST", Value: "db.prod.internal", Env: "prod", Path: "/db/config"},
				{ID: newUUID(), Key: "PORT", Value: "5432", Env: "prod", Path: "/db/config"},
				{ID: newUUID(), Key: "USER", Value: "admin", Env: "staging", Path: "/auth"},
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "host=db.prod.internal port=5432 user=admin", results[0].ExpandedValue)
}

func TestExpand_AbsoluteReference_DeepPathWithNestedAbsolute(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "FINAL", Value: "${prod.level1.level2.FIRST}", Env: "dev", Path: "/"},
	}

	fetchCount := 0
	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
			fetchCount++
			if fetchCount == 1 {
				assert.Equal(t, "/level1/level2", refs[0].Path)
				assert.Equal(t, "FIRST", refs[0].Key)
				return []SecretInput{
					{ID: newUUID(), Key: "FIRST", Value: "got-${staging.nested.path.SECOND}", Env: "prod", Path: "/level1/level2"},
				}
			}
			if fetchCount == 2 {
				assert.Equal(t, "/nested/path", refs[0].Path)
				assert.Equal(t, "SECOND", refs[0].Key)
				return []SecretInput{
					{ID: newUUID(), Key: "SECOND", Value: "final-value", Env: "staging", Path: "/nested/path"},
				}
			}
			return nil
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, 2, fetchCount)
	assert.Equal(t, "got-final-value", results[0].ExpandedValue)
}

func TestExpand_AbsoluteReference_DeepPathMixedWithRelative(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "LOCAL_PREFIX", Value: "myapp", Env: "dev", Path: "/"},
		{ID: newUUID(), Key: "RESULT", Value: "${LOCAL_PREFIX}-${prod.config.db.DATABASE_NAME}", Env: "dev", Path: "/"},
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
			assert.Equal(t, "prod", refs[0].Env)
			assert.Equal(t, "/config/db", refs[0].Path)
			assert.Equal(t, "DATABASE_NAME", refs[0].Key)

			return []SecretInput{
				{ID: newUUID(), Key: "DATABASE_NAME", Value: "production_db", Env: "prod", Path: "/config/db"},
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "myapp-production_db", results[1].ExpandedValue)
}

func TestExpand_AbsoluteReference_SameKeyDifferentPaths(t *testing.T) {
	secrets := []SecretInput{
		{ID: newUUID(), Key: "COMBINED", Value: "${prod.us.east.API_KEY}-${prod.eu.west.API_KEY}", Env: "dev", Path: "/"},
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
			assert.Len(t, refs, 2)

			return []SecretInput{
				{ID: newUUID(), Key: "API_KEY", Value: "us-key-123", Env: "prod", Path: "/us/east"},
				{ID: newUUID(), Key: "API_KEY", Value: "eu-key-456", Env: "prod", Path: "/eu/west"},
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()
	results := expander.Secrets()

	assert.Equal(t, "us-key-123-eu-key-456", results[0].ExpandedValue)
}

func TestExpand_LookUp(t *testing.T) {
	id1, id2 := newUUID(), newUUID()
	secrets := []SecretInput{
		{ID: id1, Key: "A", Value: "hello", Env: "dev", Path: "/"},
		{ID: id2, Key: "B", Value: "${A} world", Env: "dev", Path: "/"},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	val1, ok1 := expander.LookUp(id1)
	assert.True(t, ok1)
	assert.Equal(t, "hello", val1)

	val2, ok2 := expander.LookUp(id2)
	assert.True(t, ok2)
	assert.Equal(t, "hello world", val2)

	_, ok3 := expander.LookUp(newUUID())
	assert.False(t, ok3)
}
