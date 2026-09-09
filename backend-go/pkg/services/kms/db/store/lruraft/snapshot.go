package lruraft

import (
	"errors"
	"fmt"
	"log/slog"

	"go.etcd.io/etcd/server/v3/storage/wal/walpb"
	"go.etcd.io/raft/v3"
	"go.etcd.io/raft/v3/raftpb"
)

var snapshotCatchUpEntriesN uint64 = 10000

func (rc *raftLRUNode) publishSnapshot(snapshotToSave *raftpb.Snapshot) error {
	if raft.IsEmptySnap(snapshotToSave) {
		return nil
	}

	logger := slog.Default()
	logger.Info("publishing raft snapshot", "index", rc.snapshotIndex)
	defer logger.Info("finished publishing raft snapshot", "index", rc.snapshotIndex)

	if snapshotToSave.Metadata.GetIndex() <= rc.appliedCommitIndex {
		return fmt.Errorf("snapshot index [%d] must be greater than applied index [%d]", snapshotToSave.Metadata.GetIndex(), rc.appliedCommitIndex)
	}
	if err := rc.publishSnapshotData(snapshotToSave.Data); err != nil {
		return err
	}

	rc.confState = snapshotToSave.Metadata.ConfState
	rc.snapshotIndex = snapshotToSave.Metadata.GetIndex()
	rc.appliedCommitIndex = snapshotToSave.Metadata.GetIndex()
	return nil
}

func (rc *raftLRUNode) publishSnapshotData(data []byte) error {
	select {
	case rc.CommitCh <- &Commit{Data: data, IsSnapshot: true}:
		return nil
	case <-rc.closedProposalCh:
		return errors.New("Raft stopped before snapshot could be applied")
	}
}

func (rc *raftLRUNode) maybeTriggerSnapshot(applyDoneC <-chan bool) error {
	if rc.appliedCommitIndex-rc.snapshotIndex <= rc.snapCount {
		return nil
	}

	// wait until all committed entries are applied (or server is closed)
	if applyDoneC != nil {
		select {
		case <-applyDoneC:
		case <-rc.closedProposalCh:
			return nil
		}
	}

	slog.Default().Info("starting raft snapshot", "applied_index", rc.appliedCommitIndex, "last_snapshot_index", rc.snapshotIndex)
	data, err := rc.getSnapshot()
	if err != nil {
		return fmt.Errorf("get snapshot data: %w", err)
	}
	snap, err := rc.raftStorage.CreateSnapshot(rc.appliedCommitIndex, rc.confState, data)
	if err != nil {
		return fmt.Errorf("create raft snapshot: %w", err)
	}
	if err := rc.saveSnap(snap); err != nil {
		return fmt.Errorf("save raft snapshot: %w", err)
	}

	compactIndex := uint64(1)
	if rc.appliedCommitIndex > snapshotCatchUpEntriesN {
		compactIndex = rc.appliedCommitIndex - snapshotCatchUpEntriesN
	}
	if err := rc.raftStorage.Compact(compactIndex); err != nil {
		if !errors.Is(err, raft.ErrCompacted) {
			return fmt.Errorf("compact raft log at index %d: %w", compactIndex, err)
		}
	} else {
		slog.Default().Info("compacted raft log", "index", compactIndex)
	}

	rc.snapshotIndex = rc.appliedCommitIndex
	return nil
}

func (rc *raftLRUNode) saveSnap(snap *raftpb.Snapshot) error {
	walSnap := walpb.Snapshot{
		Index:     snap.Metadata.Index,
		Term:      snap.Metadata.Term,
		ConfState: snap.Metadata.ConfState,
	}
	// save the snapshot file before writing the snapshot to the wal.
	// This makes it possible for the snapshot file to become orphaned, but prevents
	// a WAL snapshot entry from having no corresponding snapshot file.
	if err := rc.snapshotter.SaveSnap(snap); err != nil {
		return err
	}
	if err := rc.wal.SaveSnapshot(&walSnap); err != nil {
		return err
	}
	return rc.wal.ReleaseLockTo(snap.Metadata.GetIndex())
}
