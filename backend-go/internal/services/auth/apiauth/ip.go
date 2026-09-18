package apiauth

import (
	"encoding/json"
	"net"
	"strconv"

	"github.com/infisical/api/internal/libs/errutil"
)

// TrustedIP represents a single trusted IP entry stored as JSON in the DB.
type TrustedIP struct {
	IPAddress string `json:"ipAddress"`
	Type      string `json:"type"`
	Prefix    *int   `json:"prefix,omitempty"` // nil = plain IP, non-nil = CIDR notation
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
		return errutil.Forbidden("You are not allowed to access this resource from the current IP address").WithErrf("checkIPAgainstBlocklist: failed to parse IP %s", ipAddress)
	}

	for _, tip := range trustedIPs {
		trusted := net.ParseIP(tip.IPAddress)
		if trusted == nil {
			continue
		}

		// If Prefix is set (including 0 for /0), use CIDR matching
		// Otherwise, do exact IP comparison
		if tip.Prefix != nil {
			_, cidr, err := net.ParseCIDR(tip.IPAddress + "/" + strconv.Itoa(*tip.Prefix))
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

	return errutil.Forbidden("You are not allowed to access this resource from the current IP address").WithErrf("checkIPAgainstBlocklist: IP %s not in allowlist", ipAddress)
}
