package store

import (
	"database/sql"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/infisical/api/pkg/services/kms/db/store/lruraft"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

type raftCallbackRecorder struct {
	deletedKeyID string
	traceID      string
	updated      *kmsproto.KeyUpdatedPayload
	snapshot     []byte
}

func (r *raftCallbackRecorder) OnKeyDeleted(keyID string, traceID string) {
	r.deletedKeyID = keyID
	r.traceID = traceID
}

func (r *raftCallbackRecorder) OnKeyUpdated(payload *kmsproto.KeyUpdatedPayload, traceID string) {
	r.updated = payload
	r.traceID = traceID
}

func (r *raftCallbackRecorder) RestoreSnapshot(data []byte) error {
	r.snapshot = append([]byte(nil), data...)
	return nil
}

func TestRaftBridge_HookKeyDeleted(t *testing.T) {
	proposals := make(chan []byte, 1)
	bridge := NewRaftBridge(proposals, nil)

	bridge.HookKeyDeleted("key-id", "bench-raft-test")

	payload := new(kmsproto.RaftSyncPayload)
	require.NoError(t, proto.Unmarshal(<-proposals, payload))
	require.Equal(t, kmsproto.RaftSyncAction_RAFT_SYNC_ACTION_KEY_DELETED, payload.GetAction())
	require.Equal(t, "key-id", payload.GetDeletedKeyId())
	require.Equal(t, "bench-raft-test", payload.GetTraceId())
}

func TestRaftListener_HandleCommitKeyUpdated(t *testing.T) {
	callback := new(raftCallbackRecorder)
	listener := NewRaftListener(nil, callback)
	writtenAt := time.Now().UTC().Truncate(time.Nanosecond)
	payload := &kmsproto.RaftSyncPayload{
		Action:  kmsproto.RaftSyncAction_RAFT_SYNC_ACTION_KEY_UPDATED,
		TraceId: "bench-raft-test",
		Payload: &kmsproto.RaftSyncPayload_KeyUpdated{KeyUpdated: &kmsproto.KeyUpdatedPayload{
			KeyId: "key-id", Name: "renamed-key", UpdatedAtUnixNano: writtenAt.UnixNano(),
		}},
	}
	data, err := proto.Marshal(payload)
	require.NoError(t, err)

	require.NoError(t, listener.handleCommit(data, 42))
	require.True(t, proto.Equal(payload.GetKeyUpdated(), callback.updated))
	require.Equal(t, "bench-raft-test", callback.traceID)
}

func TestRaftListener_HandleCommitRejectsMissingKeyID(t *testing.T) {
	listener := NewRaftListener(nil, new(raftCallbackRecorder))
	data, err := proto.Marshal(&kmsproto.RaftSyncPayload{
		Action:  kmsproto.RaftSyncAction_RAFT_SYNC_ACTION_KEY_DELETED,
		Payload: &kmsproto.RaftSyncPayload_DeletedKeyId{},
	})
	require.NoError(t, err)

	require.EqualError(t, listener.handleCommit(data, 42), "decode raft key deletion: key ID is required")
}

func TestRaftListener_InitRestoresSnapshot(t *testing.T) {
	commits := make(chan *lruraft.Commit, 1)
	callback := new(raftCallbackRecorder)
	listener := NewRaftListener(commits, callback)
	commits <- &lruraft.Commit{Data: []byte(`[{"id":"key"}]`), IsSnapshot: true}
	close(commits)

	listener.Init()

	require.JSONEq(t, `[{"id":"key"}]`, string(callback.snapshot))
}

func TestKMSStore_GetSnapshot(t *testing.T) {
	cache := NewKeyMetaCache()
	keyID := uuid.New()
	projectID := uuid.New()
	updatedAt := time.Now().UTC().Truncate(time.Nanosecond)
	cache.Add(keyID, &KmsKeyMetaFieldsResult{
		ID: keyID, Name: "cache-key", Description: sql.Null[string]{V: "cache description", Valid: true},
		IsDisabled: sql.Null[bool]{V: true, Valid: true}, IsReserved: sql.Null[bool]{V: false, Valid: true},
		OrgID: uuid.New(), ProjectID: sql.Null[uuid.UUID]{V: projectID, Valid: true}, KeyUsage: "signing",
		IsExportable: true, HasDeleteProtection: true, UpdatedAt: updatedAt,
	})
	store := NewKMSStore(nil, &KmsStoreOptions{KmsMetaCache: cache})

	snapshot, err := store.GetSnapshot()
	require.NoError(t, err)

	decoded := new(kmsproto.KmsKeyMetadataSnapshot)
	require.NoError(t, proto.Unmarshal(snapshot, decoded))
	require.Len(t, decoded.GetEntries(), 1)
	require.Equal(t, keyID.String(), decoded.GetEntries()[0].GetId())
	require.Equal(t, "cache-key", decoded.GetEntries()[0].GetName())
	require.Equal(t, "cache description", decoded.GetEntries()[0].GetDescription())

	require.NoError(t, store.RestoreSnapshot(snapshot))
	entry, ok := cache.Get(keyID)
	require.True(t, ok)
	require.Equal(t, "cache-key", entry.Name)
	require.Equal(t, projectID, entry.ProjectID.V)
	require.True(t, updatedAt.Equal(entry.UpdatedAt))
}

func TestKMSStore_RestoreSnapshot(t *testing.T) {
	cache := NewKeyMetaCache()
	cache.Add(uuid.New(), &KmsKeyMetaFieldsResult{Name: "stale-key"})
	keyID := uuid.New()
	snapshot, err := proto.Marshal(&kmsproto.KmsKeyMetadataSnapshot{Entries: []*kmsproto.KmsKeyMetadata{{
		Id: keyID.String(), OrgId: uuid.New().String(), Name: "restored-key",
	}}})
	require.NoError(t, err)
	store := NewKMSStore(nil, &KmsStoreOptions{KmsMetaCache: cache})

	require.NoError(t, store.RestoreSnapshot(snapshot))
	require.Equal(t, 1, cache.Len())
	entry, ok := cache.Get(keyID)
	require.True(t, ok)
	require.Equal(t, "restored-key", entry.Name)
}

func TestKMSStore_DisableCache(t *testing.T) {
	cache := NewKeyMetaCache()
	cache.Add(uuid.New(), &KmsKeyMetaFieldsResult{Name: "cached-key"})
	store := NewKMSStore(nil, &KmsStoreOptions{KmsMetaCache: cache})

	store.DisableCache()
	store.DisableCache()

	require.Zero(t, cache.Len())
	snapshot, err := store.GetSnapshot()
	require.NoError(t, err)
	decoded := new(kmsproto.KmsKeyMetadataSnapshot)
	require.NoError(t, proto.Unmarshal(snapshot, decoded))
	require.Empty(t, decoded.GetEntries())
	require.NoError(t, store.RestoreSnapshot([]byte("not valid protobuf")))
}
