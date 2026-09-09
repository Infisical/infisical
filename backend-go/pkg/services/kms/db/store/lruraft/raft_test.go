package lruraft

import (
	"errors"
	"testing"
	"time"
)

func TestRaftLRUNode_ReportErrorDoesNotBlockWhenChannelIsFull(t *testing.T) {
	errorsCh := make(chan error, 1)
	node := &raftLRUNode{ErrorC: errorsCh}
	node.reportError(errors.New("first error"))

	done := make(chan struct{})
	go func() {
		node.reportError(errors.New("second error"))
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("reportError blocked while the error channel was full")
	}
}
