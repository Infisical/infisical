package middlewares

import (
	"context"
	"net"
	"net/http"
	"testing"
)

func mustParseCIDR(s string) net.IPNet {
	_, ipNet, err := net.ParseCIDR(s)
	if err != nil {
		panic(err)
	}
	return *ipNet
}

func newRequest(remoteAddr string, headers map[string]string) *http.Request {
	r, _ := http.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	r.RemoteAddr = remoteAddr
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	return r
}

func TestGetRealIP_LegacyMode_TrustsHeaders(t *testing.T) {
	// No trusted CIDRs → legacy mode, headers trusted from anyone
	r := newRequest("5.5.5.5:12345", map[string]string{
		"X-Forwarded-For": "9.9.9.9",
	})
	got := getRealIP(r, nil)
	if got != "9.9.9.9" {
		t.Errorf("getRealIP = %q, want %q", got, "9.9.9.9")
	}
}

func TestGetRealIP_LegacyMode_FallsBackToRemoteAddr(t *testing.T) {
	r := newRequest("5.5.5.5:12345", nil)
	got := getRealIP(r, nil)
	if got != "5.5.5.5" {
		t.Errorf("getRealIP = %q, want %q", got, "5.5.5.5")
	}
}

func TestGetRealIP_StrictMode_TrustedProxy(t *testing.T) {
	// Request from a trusted proxy → trust the header
	cidrs := []net.IPNet{mustParseCIDR("10.0.0.0/8")}
	r := newRequest("10.0.0.1:8080", map[string]string{
		"X-Forwarded-For": "1.2.3.4",
	})
	got := getRealIP(r, cidrs)
	if got != "1.2.3.4" {
		t.Errorf("getRealIP = %q, want %q", got, "1.2.3.4")
	}
}

func TestGetRealIP_StrictMode_UntrustedSource(t *testing.T) {
	// Request from an untrusted IP → ignore header, use RemoteAddr
	cidrs := []net.IPNet{mustParseCIDR("10.0.0.0/8")}
	r := newRequest("5.5.5.5:12345", map[string]string{
		"X-Forwarded-For": "9.9.9.9",
	})
	got := getRealIP(r, cidrs)
	if got != "5.5.5.5" {
		t.Errorf("getRealIP = %q, want %q (should ignore spoofed header)", got, "5.5.5.5")
	}
}

func TestGetRealIP_StrictMode_XRealIP(t *testing.T) {
	// Trusted proxy with X-Real-IP instead of X-Forwarded-For
	cidrs := []net.IPNet{mustParseCIDR("172.16.0.0/12")}
	r := newRequest("172.20.0.5:443", map[string]string{
		"X-Real-IP": "8.8.8.8",
	})
	got := getRealIP(r, cidrs)
	if got != "8.8.8.8" {
		t.Errorf("getRealIP = %q, want %q", got, "8.8.8.8")
	}
}

func TestGetRealIP_StrictMode_MultipleForwardedIPs(t *testing.T) {
	// X-Forwarded-For with multiple IPs, last one is a trusted proxy →
	// walk right-to-left, skip trusted, return first non-trusted
	cidrs := []net.IPNet{mustParseCIDR("10.0.0.0/8")}
	r := newRequest("10.0.0.1:8080", map[string]string{
		"X-Forwarded-For": "1.2.3.4, 10.0.0.50",
	})
	got := getRealIP(r, cidrs)
	if got != "1.2.3.4" {
		t.Errorf("getRealIP = %q, want %q", got, "1.2.3.4")
	}
}

func TestGetRealIP_StrictMode_ProxyAppendAttack(t *testing.T) {
	// Attacker sets X-Forwarded-For: 9.9.9.9 before the proxy appends real client IP.
	// Header arrives as "9.9.9.9, 5.5.5.5" where 5.5.5.5 is the real client.
	// Walking right-to-left: 5.5.5.5 is not trusted → return it, ignore the fake 9.9.9.9.
	cidrs := []net.IPNet{mustParseCIDR("10.0.0.0/8")}
	r := newRequest("10.0.0.1:8080", map[string]string{
		"X-Forwarded-For": "9.9.9.9, 5.5.5.5",
	})
	got := getRealIP(r, cidrs)
	if got != "5.5.5.5" {
		t.Errorf("getRealIP = %q, want %q (should ignore attacker-injected IP)", got, "5.5.5.5")
	}
}

func TestGetRealIP_StrictMode_MultiHopProxy(t *testing.T) {
	// Request passes through two trusted proxies:
	// Client (1.2.3.4) → Proxy A (10.0.0.1) → Proxy B (10.0.0.2) → Server
	// XFF: 1.2.3.4, 10.0.0.1
	// Walking right-to-left: 10.0.0.1 is trusted (skip), 1.2.3.4 is not → return it.
	cidrs := []net.IPNet{mustParseCIDR("10.0.0.0/8")}
	r := newRequest("10.0.0.2:8080", map[string]string{
		"X-Forwarded-For": "1.2.3.4, 10.0.0.1",
	})
	got := getRealIP(r, cidrs)
	if got != "1.2.3.4" {
		t.Errorf("getRealIP = %q, want %q", got, "1.2.3.4")
	}
}

func TestGetRealIP_StrictMode_NoHeaders(t *testing.T) {
	// Trusted proxy but no forwarded headers → fall back to RemoteAddr
	cidrs := []net.IPNet{mustParseCIDR("10.0.0.0/8")}
	r := newRequest("10.0.0.1:8080", nil)
	got := getRealIP(r, cidrs)
	if got != "10.0.0.1" {
		t.Errorf("getRealIP = %q, want %q", got, "10.0.0.1")
	}
}

func TestGetRealIP_StrictMode_MultipleCIDRs(t *testing.T) {
	// Multiple trusted CIDR ranges
	cidrs := []net.IPNet{
		mustParseCIDR("10.0.0.0/8"),
		mustParseCIDR("192.168.0.0/16"),
	}
	r := newRequest("192.168.1.1:3000", map[string]string{
		"X-Forwarded-For": "203.0.113.50",
	})
	got := getRealIP(r, cidrs)
	if got != "203.0.113.50" {
		t.Errorf("getRealIP = %q, want %q", got, "203.0.113.50")
	}
}

func TestIsIPTrusted(t *testing.T) {
	cidrs := []net.IPNet{
		mustParseCIDR("10.0.0.0/8"),
		mustParseCIDR("172.16.0.0/12"),
	}

	cases := []struct {
		ip   string
		want bool
	}{
		{"10.0.0.1", true},
		{"10.255.255.255", true},
		{"172.16.0.1", true},
		{"172.31.255.255", true},
		{"192.168.1.1", false},
		{"8.8.8.8", false},
		{"invalid", false},
		{"", false},
	}

	for _, tc := range cases {
		got := isIPTrusted(tc.ip, cidrs)
		if got != tc.want {
			t.Errorf("isIPTrusted(%q) = %v, want %v", tc.ip, got, tc.want)
		}
	}
}
