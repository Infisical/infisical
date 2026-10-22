package fakenet

import (
	"encoding/binary"
	"fmt"
	"net"
	"strings"
	"sync"
)

const (
	typeA   = 1
	typeTXT = 16
)

// txtRecords is what fakenet answers for TXT queries. Products that prove domain
// ownership look one up, so a test publishes the record here first.
type txtRecords struct {
	mu     sync.Mutex
	byName map[string][]string
}

func newTXTRecords() *txtRecords { return &txtRecords{byName: map[string][]string{}} }

func (r *txtRecords) set(name string, values []string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.byName[canonicalName(name)] = values
}

func (r *txtRecords) remove(name string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.byName, canonicalName(name))
}

func (r *txtRecords) lookup(name string) []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.byName[canonicalName(name)]
}

func canonicalName(name string) string { return strings.ToLower(strings.TrimSuffix(name, ".")) }

// ServeDNS answers every A query with selfIP, and TXT queries from the records a test
// published. It only returns on a listen failure.
//
// This is what makes the suite hermetic, and it is not optional. Measured: with plain
// Docker network aliases and no DNS of our own, a hostname nobody faked resolves
// through to the real internet and gets a real answer. Pointing the application's
// resolver here means every name leads to fakenet, so an unfaked host gets a 501
// naming it instead of reaching a live API.
//
// Docker's embedded resolver still answers container names first and only forwards
// what it cannot, so postgres and redis keep resolving normally.
func (s *Server) ServeDNS(addr, selfIP string) error {
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
		resp, ok := answer(buf[:n], ip, s.txt)
		if !ok {
			continue
		}
		_, _ = pc.WriteTo(resp, from)
	}
}

// answer builds a reply by echoing the header and question and appending the
// records. Hand-rolled because the alternative is a dependency for a few dozen lines
// of well-specified byte layout.
func answer(q []byte, ip net.IP, txt *txtRecords) ([]byte, bool) {
	var labels []string
	off := 12
	for off < len(q) && q[off] != 0 {
		l := int(q[off])
		if l >= 0xC0 || off+1+l > len(q) {
			return nil, false // a pointer in a question is malformed
		}
		labels = append(labels, string(q[off+1:off+1+l]))
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
	binary.BigEndian.PutUint16(resp[8:10], 0)
	binary.BigEndian.PutUint16(resp[10:12], 0)

	// Anything without a record gets NOERROR with no answers rather than silence, so
	// a client asking AAAA first falls straight through to A instead of waiting out a
	// resolver timeout.
	switch qtype {
	case typeA:
		binary.BigEndian.PutUint16(resp[6:8], 1)
		resp = append(resp, 0xC0, 0x0C, 0, typeA, 0, 1, 0, 0, 0, 60, 0, 4)
		resp = append(resp, ip...)
	case typeTXT:
		values := txt.lookup(strings.Join(labels, "."))
		binary.BigEndian.PutUint16(resp[6:8], uint16(len(values)))
		for _, v := range values {
			resp = appendTXT(resp, v)
		}
	}
	return resp, true
}

// appendTXT adds one TXT record whose RDATA is the value split into character
// strings, which are capped at 255 bytes each.
func appendTXT(resp []byte, value string) []byte {
	var rdata []byte
	for rest := value; ; {
		chunk := rest
		if len(chunk) > 255 {
			chunk = chunk[:255]
		}
		rdata = append(rdata, byte(len(chunk)))
		rdata = append(rdata, chunk...)
		rest = rest[len(chunk):]
		if rest == "" {
			break
		}
	}
	resp = append(resp, 0xC0, 0x0C, 0, typeTXT, 0, 1, 0, 0, 0, 0)
	resp = binary.BigEndian.AppendUint16(resp, uint16(len(rdata)))
	return append(resp, rdata...)
}
