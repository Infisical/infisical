package fakenet

import (
	"context"
	"net"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDNS_Answers(t *testing.T) {
	t.Parallel()

	selfIP := net.ParseIP("10.201.0.53").To4()
	txt := newTXTRecords()
	resolver := localResolver(t, selfIP, txt)
	long := strings.Repeat("v", 300)

	t.Run("should answer TXT with the published values when a record is set", func(t *testing.T) {
		t.Parallel()

		// Setup
		txt.set("_infisical-verification.acme.test", []string{"infisical-domain-verification=abc", long})

		// Action
		values, err := resolver.LookupTXT(t.Context(), "_INFISICAL-verification.acme.test.")

		// Assert
		require.NoError(t, err)
		require.Equal(t, []string{"infisical-domain-verification=abc", long}, values)
	})

	t.Run("should answer TXT with no records when nothing was published", func(t *testing.T) {
		t.Parallel()

		// Action
		values, err := resolver.LookupTXT(t.Context(), "unpublished.acme.test")

		// Assert
		require.Error(t, err)
		require.Empty(t, values)
	})

	t.Run("should answer A with fakenet's address when any name is asked", func(t *testing.T) {
		t.Parallel()

		// Action
		addrs, err := resolver.LookupIP(t.Context(), "ip4", "api.github.com")

		// Assert
		require.NoError(t, err)
		require.Len(t, addrs, 1)
		require.True(t, addrs[0].Equal(selfIP))
	})
}

func localResolver(t *testing.T, selfIP net.IP, txt *txtRecords) *net.Resolver {
	t.Helper()
	pc, err := net.ListenPacket("udp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { _ = pc.Close() })

	go func() {
		buf := make([]byte, 512)
		for {
			n, from, rErr := pc.ReadFrom(buf)
			if rErr != nil {
				return
			}
			if resp, ok := answer(buf[:n], selfIP, txt); ok {
				_, _ = pc.WriteTo(resp, from)
			}
		}
	}()

	return &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "udp", pc.LocalAddr().String())
		},
	}
}
