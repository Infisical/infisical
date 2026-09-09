package lruraft

import (
	"fmt"
	"log/slog"

	"go.etcd.io/etcd/client/pkg/v3/types"
	"go.etcd.io/raft/v3/raftpb"
	"google.golang.org/protobuf/proto"
)

// publishEntries writes committed log entries to commit channel and returns
// whether all entries could be published.
func (rc *raftLRUNode) publishEntries(ents []*raftpb.Entry) (<-chan bool, bool, error) {
	if len(ents) == 0 {
		return nil, true, nil
	}

	var applyDoneC chan bool
	for i := range ents {
		switch ents[i].GetType() {
		case raftpb.EntryNormal:
			if len(ents[i].Data) == 0 {
				// ignore empty messages
				break
			}
			applyDoneC = make(chan bool, 1)
			select {
			case rc.CommitCh <- &Commit{Data: ents[i].Data, DoneApplyCh: applyDoneC, EntryIndex: ents[i].GetIndex()}:
			case <-rc.closedProposalCh:
				return nil, false, nil
			}
		case raftpb.EntryConfChange:
			var cc raftpb.ConfChange
			if err := proto.Unmarshal(ents[i].Data, &cc); err != nil {
				return nil, false, fmt.Errorf("unmarshal raft configuration change: %w", err)
			}
			rc.confState = rc.node.ApplyConfChange(&cc)
			switch cc.GetType() {
			case raftpb.ConfChangeAddNode:
				if len(cc.Context) > 0 {
					rc.transport.AddPeer(types.ID(cc.GetNodeId()), []string{string(cc.Context)})
				}
			case raftpb.ConfChangeRemoveNode:
				if cc.GetNodeId() == uint64(rc.id) {
					slog.Default().Info("raft node removed from cluster; shutting down", "node_id", rc.id)
					return nil, false, nil
				}
				rc.transport.RemovePeer(types.ID(cc.GetNodeId()))
			}
		}
	}

	// after commit, update appliedIndex
	rc.appliedCommitIndex = ents[len(ents)-1].GetIndex()

	return applyDoneC, true, nil
}

// When there is a `raftpb.EntryConfChange` after creating the snapshot,
// then the confState included in the snapshot is out of date. so We need
// to update the confState before sending a snapshot to a follower.
func (rc *raftLRUNode) processMessages(ms []*raftpb.Message) []*raftpb.Message {
	var messages []*raftpb.Message
	for i := 0; i < len(ms); i++ {
		if ms[i].GetType() == raftpb.MsgSnap {
			ms[i].Snapshot.Metadata.ConfState = rc.confState
		}
		messages = append(messages, ms[i])
	}
	return messages
}

func (rc *raftLRUNode) entriesToApply(ents []*raftpb.Entry) ([]*raftpb.Entry, error) {
	if len(ents) == 0 {
		return ents, nil
	}
	firstIdx := ents[0].GetIndex()
	if firstIdx > rc.appliedCommitIndex+1 {
		return nil, fmt.Errorf("first index of committed entry[%d] should be <= applied index[%d]+1", firstIdx, rc.appliedCommitIndex)
	}
	if rc.appliedCommitIndex-firstIdx+1 < uint64(len(ents)) {
		return ents[rc.appliedCommitIndex-firstIdx+1:], nil
	}
	return nil, nil
}
