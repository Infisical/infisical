package fakenet

import (
	"io"
	"net"
	"time"
)

// StallPort accepts TCP connections and never answers, for a test that needs a client
// to wait out its own timeout, such as a discovery scan that has to stay running. It
// closes a connection after stallHold, and one past stallMax at once.
const StallPort = 8444

// stallHold outlasts the discovery scanner's per-endpoint timeout, and stallMax bounds
// the connections held at once, so a peer that never closes cannot exhaust the shared
// fakenet's sockets. A connection over the cap is closed at once.
const (
	stallHold = 30 * time.Second
	stallMax  = 64
)

// ServeStall listens on addr and holds each connection, reading and discarding what
// the peer sends, until the peer closes it or stallHold passes. While stallMax are
// held, it closes a new connection at once.
func ServeStall(addr string) error {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	return serveStall(ln)
}

func serveStall(ln net.Listener) error {
	held := make(chan struct{}, stallMax)
	for {
		conn, err := ln.Accept()
		if err != nil {
			return err
		}
		select {
		case held <- struct{}{}:
		default:
			_ = conn.Close()
			continue
		}
		go func() {
			defer func() { <-held }()
			defer func() { _ = conn.Close() }()
			_ = conn.SetDeadline(time.Now().Add(stallHold))
			_, _ = io.Copy(io.Discard, conn)
		}()
	}
}
