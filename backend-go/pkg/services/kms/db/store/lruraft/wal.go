package lruraft

import (
	"errors"
	"fmt"
	"log/slog"
	"os"

	"go.etcd.io/etcd/server/v3/etcdserver/api/snap"
	"go.etcd.io/etcd/server/v3/storage/wal"
	"go.etcd.io/etcd/server/v3/storage/wal/walpb"
	"go.etcd.io/raft/v3"
	"go.etcd.io/raft/v3/raftpb"
)

// replayWAL replays WAL entries into the raft instance.
func (r *raftLRUNode) replayWAL() (*wal.WAL, error) {
	snapshot, err := r.loadSnapshot()
	if err != nil {
		return nil, err
	}

	wal, err := r.openWAL(snapshot)
	if err != nil {
		return nil, err
	}
	_, state, entries, err := wal.ReadAll()

	if err != nil {
		return nil, fmt.Errorf("error reading wal: (%v)", err)
	}

	r.raftStorage = raft.NewMemoryStorage()
	if snapshot != nil {
		r.initialSnapshot = append([]byte(nil), snapshot.Data...)
		r.raftStorage.ApplySnapshot(snapshot)
	}
	// account for wal entries post initialization
	r.raftStorage.Append(entries)
	r.raftStorage.SetHardState(state)

	return wal, nil
}

// openWAL returns a WAL ready for reading
func (rc *raftLRUNode) openWAL(snapshot *raftpb.Snapshot) (*wal.WAL, error) {
	if !wal.Exist(rc.dirWal) {
		if err := os.Mkdir(rc.dirWal, 0o750); err != nil {
			return nil, fmt.Errorf("cannot create dir for wal : (%v)", err)
		}

		w, err := wal.Create(rc.logger, rc.dirWal, nil)
		if err != nil {
			return nil, fmt.Errorf("create wal error: (%v)", err)
		}
		w.Close()
	}

	snapshotFromWal := walpb.Snapshot{}
	if snapshot.GetMetadata() != nil {
		snapshotFromWal.Index, snapshotFromWal.Term = snapshot.Metadata.Index, snapshot.Metadata.Term
	}

	slog.Default().Debug("loading WAL", "term", snapshotFromWal.Term, "index", snapshotFromWal.Index)

	w, err := wal.Open(rc.logger, rc.dirWal, &snapshotFromWal)

	if err != nil {
		return nil, fmt.Errorf("open WAL: %w", err)
	}

	return w, nil
}

func (rc *raftLRUNode) loadSnapshot() (*raftpb.Snapshot, error) {
	if wal.Exist(rc.dirWal) {
		walSnaps, err := wal.ValidSnapshotEntries(rc.logger, rc.dirWal)
		if err != nil {
			return nil, fmt.Errorf("raftexample: error listing snapshots (%v)", err)
		}
		snapshot, err := rc.snapshotter.LoadNewestAvailable(walSnaps)
		if err != nil && !errors.Is(err, snap.ErrNoSnapshot) {
			return nil, fmt.Errorf("raftexample: error loading snapshot (%v)", err)
		}
		return snapshot, nil
	}
	return &raftpb.Snapshot{}, nil
}
