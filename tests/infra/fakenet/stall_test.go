package fakenet

import (
	"errors"
	"net"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestServeStall(t *testing.T) {
	t.Parallel()

	t.Run("should hold a connection open without answering", func(t *testing.T) {
		t.Parallel()

		// Setup
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		require.NoError(t, err)
		t.Cleanup(func() { _ = ln.Close() })
		go func() { _ = serveStall(ln) }()
		conn, err := net.Dial("tcp", ln.Addr().String())
		require.NoError(t, err)
		t.Cleanup(func() { _ = conn.Close() })
		_, err = conn.Write([]byte("GET / HTTP/1.1\r\n\r\n"))
		require.NoError(t, err)

		// Action
		require.NoError(t, conn.SetReadDeadline(time.Now().Add(200*time.Millisecond)))
		_, err = conn.Read(make([]byte, 1))

		// Assert
		require.True(t, errors.Is(err, os.ErrDeadlineExceeded), "the connection should still be open with nothing to read, got %v", err)
	})
}
