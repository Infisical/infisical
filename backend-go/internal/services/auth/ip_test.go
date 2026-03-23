package auth

import (
	"testing"
)

func TestParseTrustedIPs(t *testing.T) {
	t.Run("empty string returns nil", func(t *testing.T) {
		ips, err := parseTrustedIPs("")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ips != nil {
			t.Fatalf("expected nil, got %v", ips)
		}
	})

	t.Run("valid JSON", func(t *testing.T) {
		raw := `[{"ipAddress":"10.0.0.1","type":"ipv4"},{"ipAddress":"192.168.1.0","type":"ipv4","prefix":24}]`
		ips, err := parseTrustedIPs(raw)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(ips) != 2 {
			t.Fatalf("expected 2 IPs, got %d", len(ips))
		}
		if ips[0].IPAddress != "10.0.0.1" {
			t.Errorf("expected 10.0.0.1, got %s", ips[0].IPAddress)
		}
		if ips[1].Prefix != 24 {
			t.Errorf("expected prefix 24, got %d", ips[1].Prefix)
		}
	})

	t.Run("invalid JSON returns error", func(t *testing.T) {
		_, err := parseTrustedIPs("not json")
		if err == nil {
			t.Fatal("expected error for invalid JSON")
		}
	})
}

func TestCheckIPAgainstBlocklist(t *testing.T) {
	t.Run("empty list allows all", func(t *testing.T) {
		err := checkIPAgainstBlocklist("1.2.3.4", nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		err = checkIPAgainstBlocklist("1.2.3.4", []TrustedIP{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("exact IP match allows", func(t *testing.T) {
		trusted := []TrustedIP{{IPAddress: "10.0.0.5", Type: "ipv4"}}
		err := checkIPAgainstBlocklist("10.0.0.5", trusted)
		if err != nil {
			t.Fatalf("expected allowed, got: %v", err)
		}
	})

	t.Run("exact IP mismatch denies", func(t *testing.T) {
		trusted := []TrustedIP{{IPAddress: "10.0.0.5", Type: "ipv4"}}
		err := checkIPAgainstBlocklist("10.0.0.6", trusted)
		if err == nil {
			t.Fatal("expected denied for mismatched IP")
		}
	})

	t.Run("CIDR match allows", func(t *testing.T) {
		trusted := []TrustedIP{{IPAddress: "192.168.1.0", Type: "ipv4", Prefix: 24}}
		err := checkIPAgainstBlocklist("192.168.1.100", trusted)
		if err != nil {
			t.Fatalf("expected allowed within CIDR, got: %v", err)
		}
	})

	t.Run("CIDR mismatch denies", func(t *testing.T) {
		trusted := []TrustedIP{{IPAddress: "192.168.1.0", Type: "ipv4", Prefix: 24}}
		err := checkIPAgainstBlocklist("192.168.2.1", trusted)
		if err == nil {
			t.Fatal("expected denied for IP outside CIDR range")
		}
	})

	t.Run("multiple entries matches any", func(t *testing.T) {
		trusted := []TrustedIP{
			{IPAddress: "10.0.0.1", Type: "ipv4"},
			{IPAddress: "172.16.0.0", Type: "ipv4", Prefix: 12},
		}
		// First entry exact match.
		if err := checkIPAgainstBlocklist("10.0.0.1", trusted); err != nil {
			t.Fatalf("expected match on first entry: %v", err)
		}
		// Second entry CIDR match.
		if err := checkIPAgainstBlocklist("172.20.5.5", trusted); err != nil {
			t.Fatalf("expected match on second entry (CIDR): %v", err)
		}
		// No match.
		if err := checkIPAgainstBlocklist("8.8.8.8", trusted); err == nil {
			t.Fatal("expected denied for IP matching neither entry")
		}
	})

	t.Run("invalid incoming IP denies", func(t *testing.T) {
		trusted := []TrustedIP{{IPAddress: "10.0.0.1", Type: "ipv4"}}
		err := checkIPAgainstBlocklist("not-an-ip", trusted)
		if err == nil {
			t.Fatal("expected denied for invalid incoming IP")
		}
	})

	t.Run("invalid trusted IP is skipped", func(t *testing.T) {
		trusted := []TrustedIP{
			{IPAddress: "not-valid", Type: "ipv4"},
			{IPAddress: "10.0.0.1", Type: "ipv4"},
		}
		// Should skip the invalid entry and match the second one.
		err := checkIPAgainstBlocklist("10.0.0.1", trusted)
		if err != nil {
			t.Fatalf("expected allowed after skipping invalid entry: %v", err)
		}
	})

	t.Run("IPv6 exact match", func(t *testing.T) {
		trusted := []TrustedIP{{IPAddress: "::1", Type: "ipv6"}}
		err := checkIPAgainstBlocklist("::1", trusted)
		if err != nil {
			t.Fatalf("expected allowed for IPv6 loopback: %v", err)
		}
	})

	t.Run("IPv6 CIDR match", func(t *testing.T) {
		trusted := []TrustedIP{{IPAddress: "fd00::", Type: "ipv6", Prefix: 8}}
		err := checkIPAgainstBlocklist("fd12:3456::1", trusted)
		if err != nil {
			t.Fatalf("expected allowed within IPv6 CIDR: %v", err)
		}
	})
}

func TestItoa(t *testing.T) {
	tests := []struct {
		input    int
		expected string
	}{
		{0, "0"},
		{1, "1"},
		{8, "8"},
		{24, "24"},
		{128, "128"},
		{255, "255"},
	}

	for _, tc := range tests {
		got := itoa(tc.input)
		if got != tc.expected {
			t.Errorf("itoa(%d) = %q, want %q", tc.input, got, tc.expected)
		}
	}
}
