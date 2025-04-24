//go:build !windows
// +build !windows

package udplistener

import (
	"net"
	"syscall"

	"golang.org/x/sys/unix"
	// other imports
)

func SetupListenerConfig() *net.ListenConfig {
	return &net.ListenConfig{
		Control: func(network, address string, conn syscall.RawConn) error {
			var operr error
			if err := conn.Control(func(fd uintptr) {
				operr = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, unix.SO_REUSEPORT, 1)
			}); err != nil {
				return err
			}
			return operr
		},
	}
}
