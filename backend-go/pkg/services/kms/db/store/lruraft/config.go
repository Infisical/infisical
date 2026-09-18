package lruraft

import (
	"net/http"

	"go.etcd.io/raft/v3/raftpb"
)

// todo: modifyConfigCh goes to http handler to handler configChange

type raftConfigHandler struct {
	modifyConfigCh chan<- *raftpb.ConfChange
}

func (*raftConfigHandler) ModifyConfig(w http.ResponseWriter, r *http.Request) {
	// todo: decode data
	// send response to channel await and respond to http request
}
