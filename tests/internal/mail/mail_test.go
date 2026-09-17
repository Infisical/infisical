package mail

import "testing"

func TestParam_FindsTheInviteToken(t *testing.T) {
	// Shaped like the real OrgInvite mail: the same link appears in both the text and
	// the HTML part, and the HTML one is quoted inside an attribute.
	m := Message{Subject: "Infisical organization invitation", Body: `
Join the organization:
http://localhost:8080/signupinvite?token=abc123&to=alice%40acme.test&organization_id=org-1

<a href="http://localhost:8080/signupinvite?token=abc123&to=alice%40acme.test&organization_id=org-1">Accept</a>
`}

	got, err := Param(m, "token")
	if err != nil {
		t.Fatalf("extracting the token: %v", err)
	}
	if got != "abc123" {
		t.Errorf("token = %q, want abc123", got)
	}
}

func TestParam_SkipsLinksWithoutIt(t *testing.T) {
	// Every Infisical mail carries unsubscribe and logo links, so the first URL in the
	// body is routinely not the one that matters.
	m := Message{Body: `
<img src="https://cdn.infisical.com/logo.png">
https://infisical.com/docs
http://localhost:8080/signupinvite?token=wanted&to=bob%40acme.test
`}

	got, err := Param(m, "token")
	if err != nil {
		t.Fatalf("extracting the token: %v", err)
	}
	if got != "wanted" {
		t.Errorf("token = %q, want wanted", got)
	}
}

func TestParam_ReportsTheBodyWhenAbsent(t *testing.T) {
	// The failure a wrong template produces. Without the body in the message there is
	// nothing to debug from: the mail arrived, it just did not carry what was expected.
	m := Message{Subject: "Welcome", Body: "https://infisical.com/docs\n"}

	if _, err := Param(m, "token"); err == nil {
		t.Fatal("expected an error when no link carries the parameter")
	} else if got := err.Error(); !contains(got, "Welcome") || !contains(got, "infisical.com/docs") {
		t.Errorf("error should name the subject and show the body, got: %s", got)
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

func TestCode_FindsTheSignupCode(t *testing.T) {
	m := Message{Subject: "Your confirmation code", Body: `
Confirm your email address with this code:

  481920

This code expires in 5 minutes. Sent 2026-09-17.
`}

	got, err := Code(m, 6)
	if err != nil {
		t.Fatalf("extracting the code: %v", err)
	}
	if got != "481920" {
		t.Errorf("code = %q, want 481920", got)
	}
}

func TestCode_IgnoresLongerNumbers(t *testing.T) {
	// A year, a port and a message id are all digits, and the footer of a real mail
	// is full of them. Matching a bare run of digits would pick up the wrong one.
	m := Message{Subject: "Your confirmation code", Body: "id=20260917120000 port=8080\ncode: 771234\n"}

	got, err := Code(m, 6)
	if err != nil {
		t.Fatalf("extracting the code: %v", err)
	}
	if got != "771234" {
		t.Errorf("code = %q, want 771234", got)
	}
}
