package smtp

import (
	"context"
	"fmt"
	"net/http/httptest"
	"net/smtp"
	"path/filepath"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

// Shaped like nodemailer's output: multipart/alternative, quoted-printable, an
// encoded subject, and a soft line break through the middle of the invite link.
const nodemailerShaped = "From: Infisical Harness <harness@infisical.test>\r\n" +
	"To: alice@acme.test\r\n" +
	"Subject: =?UTF-8?Q?Infisical_organization_invitation?=\r\n" +
	"MIME-Version: 1.0\r\n" +
	"Content-Type: multipart/alternative; boundary=\"--_b1\"\r\n" +
	"\r\n" +
	"----_b1\r\n" +
	"Content-Type: text/plain; charset=utf-8\r\n" +
	"Content-Transfer-Encoding: quoted-printable\r\n" +
	"\r\n" +
	"Join: http://localhost:8080/signupinvite?token=3Dabc123&to=3Dalice%40acme.=\r\n" +
	"test\r\n" +
	"----_b1\r\n" +
	"Content-Type: text/html; charset=utf-8\r\n" +
	"Content-Transfer-Encoding: base64\r\n" +
	"\r\n" +
	"PGEgaHJlZj0iaHR0cDovL2V4YW1wbGUudGVzdCI+QWNjZXB0PC9hPg==\r\n" +
	"----_b1--\r\n"

type rig struct {
	smtpAddr string
	adminURL string
}

// newRig runs the SMTP fake against a real fakenet event log and opens this test's
// event stream, as fakenet and harness.Main do.
func newRig(t *testing.T) *rig {
	t.Helper()
	srv := fakenet.New()
	ca, err := fakenet.LoadOrCreateCA(filepath.Join(t.TempDir(), "ca.pem"))
	require.NoError(t, err)
	admin := httptest.NewServer(srv.Admin(ca))
	t.Cleanup(admin.Close)

	mail := newServer(0, func(domain string) fakenet.Emitter { return srv.Emitter(Host, domain) })
	require.NoError(t, mail.Start())
	t.Cleanup(func() { _ = mail.Stop() })

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	require.NoError(t, fakenet.Listen(ctx, admin.URL, ""))

	return &rig{smtpAddr: fmt.Sprintf("127.0.0.1:%d", mail.mock.PortNumber()), adminURL: admin.URL}
}

func (r *rig) inbox(t *testing.T, domain string) *Inbox {
	t.Helper()
	Track(t, r.adminURL, domain)
	return Open(r.adminURL, domain)
}

func (r *rig) send(t *testing.T, to []string, msg string) {
	t.Helper()
	require.NoError(t, smtp.SendMail(r.smtpAddr, nil, "harness@infisical.test", to, []byte(msg)))
}

func TestInbox_Expect(t *testing.T) {
	t.Run("should decode a nodemailer-shaped message for its recipient", func(t *testing.T) {
		// Setup
		r := newRig(t)
		in := r.inbox(t, "acme.test")

		// Action
		r.send(t, []string{"alice@acme.test"}, nodemailerShaped)

		// Assert
		got := in.Expect(t, "alice@acme.test", Subject("invitation"))
		require.Empty(t, got.ParseError)
		require.Equal(t, "harness@infisical.test", got.From)
		require.Equal(t, "Infisical organization invitation", got.Subject)
		require.Contains(t, got.Body, "token=abc123&to=alice%40acme.test", "quoted-printable was not decoded")
		require.Contains(t, got.Body, `<a href="http://example.test">Accept</a>`, "base64 was not decoded")
	})

	t.Run("should not deliver one domain's mail to another domain's inbox", func(t *testing.T) {
		// Setup
		r := newRig(t)
		one, two := r.inbox(t, "one.test"), r.inbox(t, "two.test")

		// Action
		r.send(t, []string{"alice@one.test"}, "Subject: for one\r\n\r\nbody\r\n")

		// Assert
		one.Expect(t, "alice@one.test")
		two.ExpectNoEvent[MessageReceived](t, nil)
	})

	t.Run("should match the recipient regardless of case", func(t *testing.T) {
		// Setup
		r := newRig(t)
		in := r.inbox(t, "acme.test")

		// Action
		r.send(t, []string{"Alice@acme.test"}, "Subject: hi\r\n\r\nbody\r\n")

		// Assert
		in.Expect(t, "ALICE@acme.test")
	})

	t.Run("should satisfy one expectation per recipient when a message goes to several", func(t *testing.T) {
		// Setup
		r := newRig(t)
		in := r.inbox(t, "x.test")

		// Action
		r.send(t, []string{"a@x.test", "b@x.test"}, "Subject: both\r\n\r\nbody\r\n")

		// Assert
		require.Contains(t, in.Expect(t, "a@x.test").Body, "body")
		require.Contains(t, in.Expect(t, "b@x.test").Body, "body")
	})

	t.Run("should claim each message once", func(t *testing.T) {
		// Setup
		r := newRig(t)
		in := r.inbox(t, "acme.test")
		r.send(t, []string{"alice@acme.test"}, "Subject: first\r\n\r\nbody\r\n")
		in.Expect(t, "alice@acme.test")

		// Action
		r.send(t, []string{"alice@acme.test"}, "Subject: second\r\n\r\nbody\r\n")

		// Assert
		require.Equal(t, "second", in.Expect(t, "alice@acme.test").Subject)
	})
}
