package fakenet

import (
	"encoding/binary"
	"fmt"
	"net"
)

// ServeDNS answers every A query with selfIP. It only returns on a listen failure.
//
// This is what makes the suite hermetic, and it is not optional. Measured: with plain
// Docker network aliases and no DNS of our own, a hostname nobody faked resolves
// through to the real internet and gets a real answer. Pointing the application's
// resolver here means every name leads to fakenet, so an unfaked host gets a 501
// naming it instead of reaching a live API.
//
// Docker's embedded resolver still answers container names first and only forwards
// what it cannot, so postgres and redis keep resolving normally.
func ServeDNS(addr, selfIP string) error {
	ip := net.ParseIP(selfIP).To4()
	if ip == nil {
		return fmt.Errorf("fakenet: %q is not an IPv4 address", selfIP)
	}

	pc, err := net.ListenPacket("udp", addr)
	if err != nil {
		return fmt.Errorf("fakenet: dns listen on %s: %w", addr, err)
	}

	buf := make([]byte, 512)
	for {
		n, from, rErr := pc.ReadFrom(buf)
		if rErr != nil || n < 12 {
			continue
		}
		resp, ok := answer(buf[:n], ip)
		if !ok {
			continue
		}
		_, _ = pc.WriteTo(resp, from)
	}
}

// answer builds a reply by echoing the header and question and appending one A
// record. Hand-rolled because the alternative is a dependency for about forty lines
// of well-specified byte layout.
func answer(q []byte, ip net.IP) ([]byte, bool) {
	off := 12
	for off < len(q) && q[off] != 0 {
		l := int(q[off])
		if l >= 0xC0 || off+1+l > len(q) {
			return nil, false // a pointer in a question is malformed
		}
		off += 1 + l
	}
	off++ // the terminating zero label
	if off+4 > len(q) {
		return nil, false
	}
	qtype := binary.BigEndian.Uint16(q[off : off+2])
	end := off + 4

	resp := make([]byte, 0, end+16)
	resp = append(resp, q[:end]...)
	resp[2] = 0x81 // QR=1, plus the RD bit the client set
	resp[3] = 0x80 // RA=1
	binary.BigEndian.PutUint16(resp[6:8], 0)

	// Anything other than A gets NOERROR with no answers rather than silence, so a
	// client asking AAAA first falls straight through to A instead of waiting out a
	// resolver timeout.
	if qtype == 1 {
		binary.BigEndian.PutUint16(resp[6:8], 1)
		resp = append(resp, 0xC0, 0x0C, 0, 1, 0, 1, 0, 0, 0, 60, 0, 4)
		resp = append(resp, ip...)
	}
	return resp, true
}
