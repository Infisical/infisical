package mail

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParam(t *testing.T) {
	t.Run("should find the invite token when it appears in text and HTML parts", func(t *testing.T) {
		// Setup: shaped like the real OrgInvite mail.
		m := Message{Subject: "Infisical organization invitation", Body: `
Join the organization:
http://localhost:8080/signupinvite?token=abc123&to=alice%40acme.test&organization_id=org-1

<a href="http://localhost:8080/signupinvite?token=abc123&to=alice%40acme.test&organization_id=org-1">Accept</a>
`}

		// Action
		got, err := Param(m, "token")

		// Assert
		require.NoError(t, err)
		require.Equal(t, "abc123", got)
	})

	t.Run("should skip links that do not carry the parameter", func(t *testing.T) {
		// Setup: real mails lead with logo and docs links.
		m := Message{Body: `
<img src="https://cdn.infisical.com/logo.png">
https://infisical.com/docs
http://localhost:8080/signupinvite?token=wanted&to=bob%40acme.test
`}

		// Action
		got, err := Param(m, "token")

		// Assert
		require.NoError(t, err)
		require.Equal(t, "wanted", got)
	})

	t.Run("should report the subject and body when no link carries the parameter", func(t *testing.T) {
		// Setup
		m := Message{Subject: "Welcome", Body: "https://infisical.com/docs\n"}

		// Action
		_, err := Param(m, "token")

		// Assert
		require.Error(t, err)
		require.Contains(t, err.Error(), "Welcome")
		require.Contains(t, err.Error(), "infisical.com/docs")
	})
}

func TestCode(t *testing.T) {
	t.Run("should find the signup code", func(t *testing.T) {
		// Setup
		m := Message{Subject: "Your confirmation code", Body: `
Confirm your email address with this code:

  481920

This code expires in 5 minutes. Sent 2026-09-17.
`}

		// Action
		got, err := Code(m, 6)

		// Assert
		require.NoError(t, err)
		require.Equal(t, "481920", got)
	})

	t.Run("should ignore longer numbers in the footer", func(t *testing.T) {
		// Setup
		m := Message{Subject: "Your confirmation code", Body: "id=20260917120000 port=8080\ncode: 771234\n"}

		// Action
		got, err := Code(m, 6)

		// Assert
		require.NoError(t, err)
		require.Equal(t, "771234", got)
	})
}
