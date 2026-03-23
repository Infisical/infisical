package auth

import (
	"encoding/json"
	"net"

	"github.com/infisical/api/internal/libs/errutil"
)

// TrustedIP represents a single trusted IP entry stored as JSON in the DB.
type TrustedIP struct {
	IPAddress string `json:"ipAddress"`
	Type      string `json:"type"`
	Prefix    int    `json:"prefix,omitempty"`
}

// parseTrustedIPs parses the JSON string from the DB into a slice of TrustedIP.
func parseTrustedIPs(raw string) ([]TrustedIP, error) {
	if raw == "" {
		return nil, nil
	}
	var ips []TrustedIP
	if err := json.Unmarshal([]byte(raw), &ips); err != nil {
		return nil, err
	}
	return ips, nil
}

// checkIPAgainstBlocklist validates ipAddress against trustedIps.
// Port of backend/src/lib/ip/index.ts:checkIPAgainstBlocklist.
// Despite the name, trustedIps is an allowlist — if the IP is NOT in it, access is denied.
func checkIPAgainstBlocklist(ipAddress string, trustedIPs []TrustedIP) error {
	if len(trustedIPs) == 0 {
		return nil
	}

	incoming := net.ParseIP(ipAddress)
	if incoming == nil {
		return errutil.Forbidden("You are not allowed to access this resource from the current IP address")
	}

	for _, tip := range trustedIPs {
		trusted := net.ParseIP(tip.IPAddress)
		if trusted == nil {
			continue
		}

		if tip.Prefix > 0 {
			_, cidr, err := net.ParseCIDR(tip.IPAddress + "/" + itoa(tip.Prefix))
			if err != nil {
				continue
			}
			if cidr.Contains(incoming) {
				return nil
			}
		} else if trusted.Equal(incoming) {
			return nil
		}
	}

	return errutil.Forbidden("You are not allowed to access this resource from the current IP address")
}

// itoa converts an int to its decimal string representation without importing strconv.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	buf := make([]byte, 0, 4)
	for n > 0 {
		buf = append(buf, byte('0'+n%10))
		n /= 10
	}
	// reverse
	for i, j := 0, len(buf)-1; i < j; i, j = i+1, j-1 {
		buf[i], buf[j] = buf[j], buf[i]
	}
	return string(buf)
}
