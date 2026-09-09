package store

import (
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/infisical/api/pkg/services/kms/db/store/lruraft"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
	"go.etcd.io/raft/v3/raftpb"
	"google.golang.org/protobuf/proto"
)

type KeyMetaRaftCallback interface {
	OnKeyDeleted(keyID string, traceID string)
	OnKeyUpdated(payload *kmsproto.KeyUpdatedPayload, traceID string)
	RestoreSnapshot(data []byte) error
}

type KeyMetaRaftSyncHook interface {
	HookKeyDeleted(keyID string, traceID string)
	HookKeyUpdated(payload *kmsproto.KeyUpdatedPayload, traceID string)
}

type RaftBridge interface {
	KeyMetaRaftSyncHook
}

type raftBridge struct {
	proposeCh      chan<- []byte
	modifyConfigCh chan<- *raftpb.ConfChange
}

func (r *raftBridge) HookKeyUpdated(payload *kmsproto.KeyUpdatedPayload, traceID string) {
	if payload == nil {
		return
	}
	r.propose(&kmsproto.RaftSyncPayload{
		Action:  kmsproto.RaftSyncAction_RAFT_SYNC_ACTION_KEY_UPDATED,
		TraceId: traceID,
		Payload: &kmsproto.RaftSyncPayload_KeyUpdated{KeyUpdated: payload},
	})
}

func (r *raftBridge) HookKeyDeleted(keyID string, traceID string) {
	r.propose(&kmsproto.RaftSyncPayload{
		Action:  kmsproto.RaftSyncAction_RAFT_SYNC_ACTION_KEY_DELETED,
		TraceId: traceID,
		Payload: &kmsproto.RaftSyncPayload_DeletedKeyId{DeletedKeyId: keyID},
	})
}

func (r *raftBridge) propose(payload *kmsproto.RaftSyncPayload) {
	data, err := proto.Marshal(payload)
	if err != nil {
		return
	}
	if isBenchmarkTrace(payload.GetTraceId()) {
		slog.Default().Debug("benchmark Raft proposal queued", slog.String("trace_id", payload.GetTraceId()), slog.String("action", payload.GetAction().String()), slog.Int("payload_bytes", len(data)))
	}
	r.proposeCh <- data
}

func isBenchmarkTrace(traceID string) bool { return strings.HasPrefix(traceID, "bench-raft-") }

func NewRaftBridge(proposeCh chan<- []byte, modifyConfigCh chan<- *raftpb.ConfChange) *raftBridge {
	return &raftBridge{
		proposeCh:      proposeCh,
		modifyConfigCh: modifyConfigCh,
	}
}

type raftListener struct {
	commitCh               <-chan *lruraft.Commit
	keyMetaCallbackHandler KeyMetaRaftCallback
}

func (r *raftListener) handleCommit(data []byte, entryIndex uint64) error {
	payload := new(kmsproto.RaftSyncPayload)
	if err := proto.Unmarshal(data, payload); err != nil {
		return fmt.Errorf("decode raft sync payload: %w", err)
	}

	traceID := payload.GetTraceId()
	if isBenchmarkTrace(traceID) {
		slog.Default().Debug("benchmark Raft cache apply started", slog.String("trace_id", traceID), slog.Uint64("entry_index", entryIndex), slog.String("action", payload.GetAction().String()))
	}
	switch payload.GetAction() {
	case kmsproto.RaftSyncAction_RAFT_SYNC_ACTION_KEY_DELETED:
		keyID := payload.GetDeletedKeyId()
		if keyID == "" {
			return fmt.Errorf("decode raft key deletion: key ID is required")
		}
		r.keyMetaCallbackHandler.OnKeyDeleted(keyID, traceID)
	case kmsproto.RaftSyncAction_RAFT_SYNC_ACTION_KEY_UPDATED:
		keyUpdated := payload.GetKeyUpdated()
		if keyUpdated == nil || keyUpdated.GetKeyId() == "" {
			return fmt.Errorf("decode raft key update: key ID is required")
		}
		r.keyMetaCallbackHandler.OnKeyUpdated(keyUpdated, traceID)
	default:
		return fmt.Errorf("decode raft sync payload: unsupported action %s", payload.GetAction())
	}
	if isBenchmarkTrace(traceID) {
		slog.Default().Debug("benchmark Raft cache apply completed", slog.String("trace_id", traceID), slog.Uint64("entry_index", entryIndex), slog.String("action", payload.GetAction().String()))
	}

	return nil
}

// Init initiates event loop
func (r *raftListener) Init() {
	for commit := range r.commitCh {
		if commit == nil {
			continue
		}
		slog.Default().Debug("Raft commit received", slog.Time("event_time", time.Now().UTC()), slog.Bool("is_snapshot", commit.IsSnapshot), slog.Int("payload_bytes", len(commit.Data)))
		if commit.IsSnapshot {
			slog.Default().Debug("Raft snapshot restore started", slog.Time("event_time", time.Now().UTC()), slog.Int("snapshot_bytes", len(commit.Data)))
			if err := r.keyMetaCallbackHandler.RestoreSnapshot(commit.Data); err != nil {
				slog.Default().Debug("Raft snapshot restore failed", slog.Time("event_time", time.Now().UTC()), slog.Any("error", err))
				continue
			}
			slog.Default().Debug("Raft snapshot restored", slog.Time("event_time", time.Now().UTC()), slog.Int("snapshot_bytes", len(commit.Data)))
		} else if err := r.handleCommit(commit.Data, commit.EntryIndex); err != nil {
			continue
		}
		if commit.DoneApplyCh != nil {
			commit.DoneApplyCh <- true
		}
	}
}

func NewRaftListener(commitCh <-chan *lruraft.Commit, keyMetaCallbackHandler KeyMetaRaftCallback) *raftListener {
	return &raftListener{
		commitCh:               commitCh,
		keyMetaCallbackHandler: keyMetaCallbackHandler,
	}
}
