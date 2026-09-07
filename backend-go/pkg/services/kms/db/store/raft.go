package store

import (
	"github.com/hashicorp/go-hclog"
	"github.com/hashicorp/raft"
)

// todo : move raft to another file
type CacheConsensus struct {
	RaftDir  string
	RaftBind string

	KeyMetaCache *KeyMetaCache

	Raft *raft.Raft
}

type CacheConsensusOptions struct {
	RaftDir  string
	RaftBind string
	logLevel hclog.Level

	KeyMetaCache *KeyMetaCache
}

func NewCacheConsensus(opts *CacheConsensusOptions) *CacheConsensus {
	// pass default loge
	return &CacheConsensus{
		RaftDir:      opts.RaftBind,
		RaftBind:     opts.RaftBind,
		KeyMetaCache: opts.KeyMetaCache,
	}
}

type FSM struct {
	raft.FSM
}

// redi
