package secret

import (
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestSecret(key, value, env, path string) *ProcessedSecret {
	return &ProcessedSecret{
		Secret:      &Secret{ID: uuid.New(), Key: key},
		SecretPath:  path,
		Environment: env,
		RawValue:    value,
		Value:       value,
	}
}

func TestExpand_SimpleRelativeReference(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "hello", "dev", "/"),
		newTestSecret("B", "${A} world", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "hello", secrets[0].Value)
	assert.Equal(t, "hello world", secrets[1].Value)
}

func TestExpand_ChainedRelativeReferences(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "base", "dev", "/"),
		newTestSecret("B", "${A}-middle", "dev", "/"),
		newTestSecret("C", "${B}-end", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "base", secrets[0].Value)
	assert.Equal(t, "base-middle", secrets[1].Value)
	assert.Equal(t, "base-middle-end", secrets[2].Value)
}

func TestExpand_ImportFallback_CurrentBoardFirst(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("DB_HOST", "current-db.local", "dev", "/"),
		newTestSecret("DB_HOST", "imported-db.local", "staging", "/"),
		newTestSecret("CONNECTION", "host=${DB_HOST}", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "host=current-db.local", secrets[2].Value)
}

func TestExpand_ImportFallback_FallsBackToImport(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("LOCAL_KEY", "local-value", "dev", "/"),
		newTestSecret("IMPORT_ONLY", "from-import", "staging", "/"),
		newTestSecret("USES_IMPORT", "got=${IMPORT_ONLY}", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "got=from-import", secrets[2].Value)
}

func TestExpand_ImportOrder_FirstImportWins(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("USE_IT", "val=${SHARED_KEY}", "dev", "/"),
		newTestSecret("SHARED_KEY", "from-import-1", "staging", "/"),
		newTestSecret("SHARED_KEY", "from-import-2", "prod", "/"),
		newTestSecret("SHARED_KEY", "from-import-3", "qa", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "val=from-import-1", secrets[0].Value)
}

func TestExpand_ImportOrder_NestedImportOrder(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("USE_KEY", "result=${NESTED_KEY}", "dev", "/"),
		newTestSecret("NESTED_KEY", "staging-value", "staging", "/"),
		newTestSecret("NESTED_KEY", "prod-value", "prod", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "result=staging-value", secrets[0].Value)
}

func TestExpand_DuplicateKeysInCurrentBoard(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("DUP", "first", "dev", "/"),
		newTestSecret("DUP", "second", "dev", "/sub"),
		newTestSecret("USE_DUP", "got=${DUP}", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "got=first", secrets[2].Value)
}

func TestExpand_MissingReference_EmptyString(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "before-${MISSING}-after", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "before--after", secrets[0].Value)
}

func TestExpand_AbsoluteReference_Simple(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "use=${prod.secrets.API_KEY}", "dev", "/"),
	}

	fetchCalled := false
	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			fetchCalled = true
			assert.Len(t, refs, 1)
			assert.Equal(t, "prod", refs[0].Env)
			assert.Equal(t, "/secrets", refs[0].Path)
			assert.Equal(t, "API_KEY", refs[0].Key)

			return []*ProcessedSecret{
				newTestSecret("API_KEY", "secret-123", "prod", "/secrets"),
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()

	assert.True(t, fetchCalled)
	assert.Equal(t, "use=secret-123", secrets[0].Value)
}

func TestExpand_AbsoluteReference_RootPath(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "${prod.ROOT_KEY}", "dev", "/"),
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			assert.Equal(t, "/", refs[0].Path)
			return []*ProcessedSecret{
				newTestSecret("ROOT_KEY", "root-value", "prod", "/"),
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()

	assert.Equal(t, "root-value", secrets[0].Value)
}

func TestExpand_AbsoluteReference_DeepPath(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "${prod.level1.level2.level3.DEEP_KEY}", "dev", "/"),
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			assert.Equal(t, "/level1/level2/level3", refs[0].Path)
			return []*ProcessedSecret{
				newTestSecret("DEEP_KEY", "deep-value", "prod", "/level1/level2/level3"),
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()

	assert.Equal(t, "deep-value", secrets[0].Value)
}

func TestExpand_AbsoluteReference_WithNestedRelative(t *testing.T) {
	// A relative reference inside a value reached through an absolute reference
	// resolves in the referenced environment, not in the requesting one.
	secrets := []*ProcessedSecret{
		newTestSecret("VAR", "dev-value", "dev", "/"),
		newTestSecret("A", "${prod.USES_RELATIVE}", "dev", "/"),
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			var out []*ProcessedSecret
			for _, ref := range refs {
				switch {
				case ref.Env == "prod" && ref.Key == "USES_RELATIVE":
					out = append(out, newTestSecret("USES_RELATIVE", "prefix-${VAR}-suffix", "prod", "/"))
				case ref.Env == "prod" && ref.Key == "VAR":
					out = append(out, newTestSecret("VAR", "prod-value", "prod", "/"))
				}
			}
			return out
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()

	assert.Equal(t, "prefix-prod-value-suffix", secrets[1].Value)
	assert.Equal(t, "dev-value", secrets[0].Value)
}

func TestExpand_AbsoluteReference_ChainedAbsolute(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "${prod.KEY1}", "dev", "/"),
	}

	fetchCount := 0
	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			fetchCount++
			if fetchCount == 1 {
				assert.Equal(t, "KEY1", refs[0].Key)
				return []*ProcessedSecret{
					newTestSecret("KEY1", "${staging.KEY2}", "prod", "/"),
				}
			}
			if fetchCount == 2 {
				assert.Equal(t, "KEY2", refs[0].Key)
				return []*ProcessedSecret{
					newTestSecret("KEY2", "final-value", "staging", "/"),
				}
			}
			return nil
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()

	assert.Equal(t, 2, fetchCount)
	assert.Equal(t, "final-value", secrets[0].Value)
}

func TestExpand_AbsoluteReference_PermissionDenied(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "allowed=${prod.ALLOWED} denied=${prod.DENIED}", "dev", "/"),
	}

	opts := ExpandOpts{
		CanAccessAbsolute: func(ref AbsoluteSecretRef, tags []string) bool {
			// Only allow ALLOWED key, deny DENIED
			return ref.Key == "ALLOWED"
		},
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			// Fetch returns ALL requested secrets - permission filtering happens after
			assert.Len(t, refs, 2)
			return []*ProcessedSecret{
				newTestSecret("ALLOWED", "yes", "prod", "/"),
				newTestSecret("DENIED", "no", "prod", "/"),
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()

	assert.Equal(t, "allowed=yes denied=", secrets[0].Value)
	assert.True(t, expander.HasDeniedRefs())
	assert.Contains(t, expander.DeniedRefs(), "prod:/:DENIED")
}

func TestExpand_CircularReference_Direct(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "${B}", "dev", "/"),
		newTestSecret("B", "${A}", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "", secrets[0].Value)
	assert.Equal(t, "", secrets[1].Value)
}

func TestExpand_CircularReference_SelfReference(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "prefix-${A}-suffix", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "prefix-prefix--suffix-suffix", secrets[0].Value)
}

func TestExpand_CircularReference_ThreeWay(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "${B}", "dev", "/"),
		newTestSecret("B", "${C}", "dev", "/"),
		newTestSecret("C", "${A}", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "", secrets[0].Value)
	assert.Equal(t, "", secrets[1].Value)
	assert.Equal(t, "", secrets[2].Value)
}

func TestExpand_MaxDepth(t *testing.T) {
	secrets := make([]*ProcessedSecret, 15)
	for i := range 15 {
		key := string(rune('A' + i))
		var value string
		if i < 14 {
			nextKey := string(rune('A' + i + 1))
			value = "level" + key + "-${" + nextKey + "}"
		} else {
			value = "end"
		}
		secrets[i] = newTestSecret(key, value, "dev", "/")
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Contains(t, secrets[0].Value, "levelA-")
}

func TestExpand_MultipleReferencesInSingleValue(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("HOST", "localhost", "dev", "/"),
		newTestSecret("PORT", "5432", "dev", "/"),
		newTestSecret("USER", "admin", "dev", "/"),
		newTestSecret("CONN", "postgresql://${USER}@${HOST}:${PORT}/db", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "postgresql://admin@localhost:5432/db", secrets[3].Value)
}

func TestExpand_MixedRelativeAndAbsolute(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("LOCAL_HOST", "dev-host", "dev", "/"),
		newTestSecret("CONN", "local=${LOCAL_HOST} prod=${prod.PROD_HOST}", "dev", "/"),
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			return []*ProcessedSecret{
				newTestSecret("PROD_HOST", "prod-host", "prod", "/"),
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()

	assert.Equal(t, "local=dev-host prod=prod-host", secrets[1].Value)
}

func TestExpand_NoReferences(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("PLAIN", "just a plain value", "dev", "/"),
		newTestSecret("ANOTHER", "no references here", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "just a plain value", secrets[0].Value)
	assert.Equal(t, "no references here", secrets[1].Value)
}

func TestExpand_EmptySecretsList(t *testing.T) {
	secrets := []*ProcessedSecret{}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Empty(t, secrets)
}

func TestExpand_EmptyValue(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("EMPTY", "", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "", secrets[0].Value)
}

func TestExpand_PreservesOrder(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("FIRST", "1", "dev", "/"),
		newTestSecret("SECOND", "2", "dev", "/"),
		newTestSecret("THIRD", "3", "dev", "/"),
	}
	id1, id2, id3 := secrets[0].Secret.ID, secrets[1].Secret.ID, secrets[2].Secret.ID

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, id1, secrets[0].Secret.ID)
	assert.Equal(t, id2, secrets[1].Secret.ID)
	assert.Equal(t, id3, secrets[2].Secret.ID)
}

func TestExpand_AbsoluteFetchNotCalledWhenNotNeeded(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "${B}", "dev", "/"),
		newTestSecret("B", "local", "dev", "/"),
	}

	fetchCalled := false
	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			fetchCalled = true
			return nil
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()

	assert.False(t, fetchCalled)
	assert.Equal(t, "local", secrets[0].Value)
}

func TestExpand_BatchesFetchRequests(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "${prod.X} ${prod.Y} ${staging.Z}", "dev", "/"),
	}

	fetchCount := 0
	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			fetchCount++
			assert.Len(t, refs, 3)
			return []*ProcessedSecret{
				newTestSecret("X", "x-val", "prod", "/"),
				newTestSecret("Y", "y-val", "prod", "/"),
				newTestSecret("Z", "z-val", "staging", "/"),
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()

	assert.Equal(t, 1, fetchCount)
	assert.Equal(t, "x-val y-val z-val", secrets[0].Value)
}

func TestExpand_ImportedSecretReferencesLocalKey(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("KEY", "current-board-value", "dev", "/"),
		newTestSecret("IMPORTED", "uses ${KEY}", "staging", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "uses current-board-value", secrets[1].Value)
}

func TestExpand_SpecialCharactersInValues(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("SPECIAL", "has$pecial&chars=yes", "dev", "/"),
		newTestSecret("USE", "val=${SPECIAL}", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "val=has$pecial&chars=yes", secrets[1].Value)
}

func TestExpand_ReferenceKeyWithHyphensAndUnderscores(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("my-key_name", "special-key-value", "dev", "/"),
		newTestSecret("USE", "${my-key_name}", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "special-key-value", secrets[1].Value)
}

func TestExpand_AbsoluteRefNotFound(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "prefix-${prod.NONEXISTENT}-suffix", "dev", "/"),
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			return []*ProcessedSecret{}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()

	assert.Equal(t, "prefix--suffix", secrets[0].Value)
}

func TestExpand_NilCallbacks(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "${prod.X}", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "", secrets[0].Value)
}

func TestExpand_AbsoluteReference_TwoLevelPath(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "${prod.folder1.DB_PASSWORD}", "dev", "/"),
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			assert.Len(t, refs, 1)
			assert.Equal(t, "prod", refs[0].Env)
			assert.Equal(t, "/folder1", refs[0].Path)
			assert.Equal(t, "DB_PASSWORD", refs[0].Key)

			return []*ProcessedSecret{
				newTestSecret("DB_PASSWORD", "super-secret", "prod", "/folder1"),
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()

	assert.Equal(t, "super-secret", secrets[0].Value)
}

func TestExpand_AbsoluteReference_MultipleDeepPaths(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("CONN", "host=${prod.db.config.HOST} port=${prod.db.config.PORT} user=${staging.auth.USER}", "dev", "/"),
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			assert.Len(t, refs, 3)

			return []*ProcessedSecret{
				newTestSecret("HOST", "db.prod.internal", "prod", "/db/config"),
				newTestSecret("PORT", "5432", "prod", "/db/config"),
				newTestSecret("USER", "admin", "staging", "/auth"),
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()

	assert.Equal(t, "host=db.prod.internal port=5432 user=admin", secrets[0].Value)
}

func TestExpand_AbsoluteReference_DeepPathWithNestedAbsolute(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("FINAL", "${prod.level1.level2.FIRST}", "dev", "/"),
	}

	fetchCount := 0
	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			fetchCount++
			if fetchCount == 1 {
				assert.Equal(t, "/level1/level2", refs[0].Path)
				assert.Equal(t, "FIRST", refs[0].Key)
				return []*ProcessedSecret{
					newTestSecret("FIRST", "got-${staging.nested.path.SECOND}", "prod", "/level1/level2"),
				}
			}
			if fetchCount == 2 {
				assert.Equal(t, "/nested/path", refs[0].Path)
				assert.Equal(t, "SECOND", refs[0].Key)
				return []*ProcessedSecret{
					newTestSecret("SECOND", "final-value", "staging", "/nested/path"),
				}
			}
			return nil
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()

	assert.Equal(t, 2, fetchCount)
	assert.Equal(t, "got-final-value", secrets[0].Value)
}

func TestExpand_AbsoluteReference_DeepPathMixedWithRelative(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("LOCAL_PREFIX", "myapp", "dev", "/"),
		newTestSecret("RESULT", "${LOCAL_PREFIX}-${prod.config.db.DATABASE_NAME}", "dev", "/"),
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			assert.Equal(t, "prod", refs[0].Env)
			assert.Equal(t, "/config/db", refs[0].Path)
			assert.Equal(t, "DATABASE_NAME", refs[0].Key)

			return []*ProcessedSecret{
				newTestSecret("DATABASE_NAME", "production_db", "prod", "/config/db"),
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()

	assert.Equal(t, "myapp-production_db", secrets[1].Value)
}

func TestExpand_AbsoluteReference_SameKeyDifferentPaths(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("COMBINED", "${prod.us.east.API_KEY}-${prod.eu.west.API_KEY}", "dev", "/"),
	}

	opts := ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			assert.Len(t, refs, 2)

			return []*ProcessedSecret{
				newTestSecret("API_KEY", "us-key-123", "prod", "/us/east"),
				newTestSecret("API_KEY", "eu-key-456", "prod", "/eu/west"),
			}
		},
	}

	expander := NewSecretExpander(secrets, opts)
	expander.Expand()

	assert.Equal(t, "us-key-123-eu-key-456", secrets[0].Value)
}

func TestExpand_ValueHidden_SkipsExpansion(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "hello", "dev", "/"),
		{
			Secret:      &Secret{ID: uuid.New(), Key: "B"},
			SecretPath:  "/",
			Environment: "dev",
			RawValue:    "${A} world",
			Value:       "<hidden>",
			ValueHidden: true,
		},
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "hello", secrets[0].Value)
	assert.Equal(t, "<hidden>", secrets[1].Value)
}

func TestExpand_RawValuePreserved(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("A", "hello", "dev", "/"),
		newTestSecret("B", "${A} world", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{})
	expander.Expand()

	assert.Equal(t, "${A} world", secrets[1].RawValue)
	assert.Equal(t, "hello world", secrets[1].Value)
}

func TestExpand_NestedRelativeResolvesInReferencedEnv(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("HOST", "dev-host", "dev", "/"),
		newTestSecret("API_URL", "${prod.URL}", "dev", "/"),
	}

	var requested []string
	expander := NewSecretExpander(secrets, ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			var out []*ProcessedSecret
			for _, ref := range refs {
				requested = append(requested, ref.CacheKey())
				switch {
				case ref.Env == "prod" && ref.Key == "URL":
					out = append(out, newTestSecret("URL", "https://${HOST}/api", "prod", "/"))
				case ref.Env == "prod" && ref.Key == "HOST":
					out = append(out, newTestSecret("HOST", "prod-host", "prod", "/"))
				}
			}
			return out
		},
	})
	expander.Expand()

	assert.Equal(t, "https://prod-host/api", secrets[1].Value)
	assert.Contains(t, requested, "prod:/:HOST")
	assert.Equal(t, "dev-host", secrets[0].Value)
}

func TestExpand_NestedRelativeInReferencedPath(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("TOKEN", "local-token", "dev", "/"),
		newTestSecret("AUTH", "${prod.svc.HEADER}", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			var out []*ProcessedSecret
			for _, ref := range refs {
				switch {
				case ref.Env == "prod" && ref.Path == "/svc" && ref.Key == "HEADER":
					out = append(out, newTestSecret("HEADER", "Bearer ${TOKEN}", "prod", "/svc"))
				case ref.Env == "prod" && ref.Path == "/svc" && ref.Key == "TOKEN":
					out = append(out, newTestSecret("TOKEN", "prod-token", "prod", "/svc"))
				}
			}
			return out
		},
	})
	expander.Expand()

	assert.Equal(t, "Bearer prod-token", secrets[1].Value)
}

func TestExpand_NestedRelativeMissingInReferencedEnv(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("HOST", "dev-host", "dev", "/"),
		newTestSecret("API_URL", "${prod.URL}", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			var out []*ProcessedSecret
			for _, ref := range refs {
				if ref.Env == "prod" && ref.Key == "URL" {
					out = append(out, newTestSecret("URL", "https://${HOST}/api", "prod", "/"))
				}
			}
			return out
		},
	})
	expander.Expand()

	// The referenced env has no HOST — it must not fall back to the dev value.
	assert.Equal(t, "https:///api", secrets[1].Value)
}

func TestExpand_NestedRelativeDeniedInReferencedEnv(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("HOST", "dev-host", "dev", "/"),
		newTestSecret("API_URL", "${prod.URL}", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{
		CanAccessAbsolute: func(ref AbsoluteSecretRef, _ []string) bool {
			return ref.Key != "HOST"
		},
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			var out []*ProcessedSecret
			for _, ref := range refs {
				switch {
				case ref.Env == "prod" && ref.Key == "URL":
					out = append(out, newTestSecret("URL", "https://${HOST}/api", "prod", "/"))
				case ref.Env == "prod" && ref.Key == "HOST":
					out = append(out, newTestSecret("HOST", "prod-host", "prod", "/"))
				}
			}
			return out
		},
	})
	expander.Expand()

	assert.Equal(t, "https:///api", secrets[1].Value)
	assert.True(t, expander.HasDeniedRefs())
	assert.Contains(t, expander.DeniedRefs(), "prod:/:HOST")
}

func TestExpand_NestedRelativeCycleAcrossEnvs(t *testing.T) {
	secrets := []*ProcessedSecret{
		newTestSecret("API_URL", "${prod.URL}", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			var out []*ProcessedSecret
			for _, ref := range refs {
				if ref.Env == "prod" && ref.Key == "URL" {
					out = append(out, newTestSecret("URL", "a-${URL}-b", "prod", "/"))
				}
			}
			return out
		},
	})
	expander.Expand()

	assert.False(t, hasReferences(secrets[0].Value))
}

func TestExpand_NestedRelativeMutualCycleAcrossEnvs(t *testing.T) {
	// prod.A -> ${B} (in prod) -> ${staging.A} -> ${B} (in staging) -> ...
	// Expansion must terminate rather than fetching forever.
	secrets := []*ProcessedSecret{
		newTestSecret("ROOT", "${prod.A}", "dev", "/"),
	}

	fetches := 0
	expander := NewSecretExpander(secrets, ExpandOpts{
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			fetches++
			require.Less(t, fetches, 50, "expansion did not converge")

			var out []*ProcessedSecret
			for _, ref := range refs {
				switch ref.Key {
				case "A":
					out = append(out, newTestSecret("A", "${B}", ref.Env, ref.Path))
				case "B":
					other := "staging"
					if ref.Env == "staging" {
						other = "prod"
					}
					out = append(out, newTestSecret("B", "${"+other+".A}", ref.Env, ref.Path))
				}
			}
			return out
		},
	})
	expander.Expand()

	assert.False(t, hasReferences(secrets[0].Value))
}

func TestExpand_SelfAbsoluteRefKeepsImportFallback(t *testing.T) {
	// dev / imports staging /. An absolute reference that points back at the
	// requested board must still resolve its nested relative references through
	// the board's import fallback.
	secrets := []*ProcessedSecret{
		newTestSecret("IMPORT_ONLY", "from-import", "staging", "/"),
		newTestSecret("ROOT", "${dev.B}", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{
		BoardEnv:  "dev",
		BoardPath: "/",
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			var out []*ProcessedSecret
			for _, ref := range refs {
				// IMPORT_ONLY does not exist in the dev folder itself.
				if ref.Env == "dev" && ref.Path == "/" && ref.Key == "B" {
					out = append(out, newTestSecret("B", "x-${IMPORT_ONLY}", "dev", "/"))
				}
			}
			return out
		},
	})
	expander.Expand()

	assert.Equal(t, "x-from-import", secrets[1].Value)
}

func TestExpand_DepthLimitDoesNotLeakForeignRelativeRefs(t *testing.T) {
	// A foreign chain longer than maxExpansionDepth must not hand an unresolved
	// relative reference back to the requesting board, where a later pass would
	// resolve it locally.
	secrets := []*ProcessedSecret{
		newTestSecret("K11", "DEV-VALUE", "dev", "/"),
		newTestSecret("ROOT", "${prod.K0}", "dev", "/"),
	}

	expander := NewSecretExpander(secrets, ExpandOpts{
		BoardEnv:  "dev",
		BoardPath: "/",
		FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
			var out []*ProcessedSecret
			for _, ref := range refs {
				if ref.Env != "prod" {
					continue
				}
				for i := range 15 {
					if ref.Key == fmt.Sprintf("K%d", i) {
						out = append(out, newTestSecret(ref.Key, fmt.Sprintf("${K%d}", i+1), "prod", "/"))
					}
				}
			}
			return out
		},
	})
	expander.Expand()

	assert.NotContains(t, secrets[1].Value, "DEV-VALUE")
	assert.False(t, hasReferences(secrets[1].Value), "unresolved reference escaped to the requesting board")
}
