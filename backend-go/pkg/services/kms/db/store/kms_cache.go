package store

import (
	"github.com/google/uuid"
	"github.com/hashicorp/golang-lru/arc/v2"
)

const DefaultSize = 10000

type KeyMetaCache struct {
	*arc.ARCCache[uuid.UUID, *KmsKeyMetaFieldsResult]
}

func NewKeyMetaCache() *KeyMetaCache {
	// consume error , as error occurs only when DefaultSize < 0 and we set default > 0 value
	cache, _ := arc.NewARC[uuid.UUID, *KmsKeyMetaFieldsResult](DefaultSize)
	return &KeyMetaCache{
		ARCCache: cache,
	}
}
