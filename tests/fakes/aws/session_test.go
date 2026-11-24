package aws

import (
	"bytes"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// signedRequest is a request to svc signed with a session key and carrying its token.
func signedRequest(t *testing.T, svc service, id, secret, token string) (*http.Request, []byte) {
	t.Helper()
	body := []byte("{}")
	req, err := http.NewRequest(http.MethodPost, "https://"+svc.Host()+"/", bytes.NewReader(body))
	require.NoError(t, err)
	req.Host = svc.Host()
	req.Header.Set("X-Amz-Date", "20261117T120000Z")
	req.Header.Set("X-Amz-Security-Token", token)
	cred := credential{
		accessKeyID:   id,
		date:          "20261117",
		region:        svc.region,
		service:       svc.name,
		signedHeaders: []string{"host", "x-amz-date", "x-amz-security-token"},
	}
	sig, _ := signature(req, body, cred, secret)
	req.Header.Set("Authorization", fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s/%s/%s/aws4_request, SignedHeaders=%s, Signature=%s",
		id, cred.date, cred.region, cred.service, strings.Join(cred.signedHeaders, ";"), sig))
	return req, body
}

func TestSessionKey_Expiry(t *testing.T) {
	t.Run("should accept a session key before its deadline", func(t *testing.T) {
		// Setup
		id, secret, token := issueSessionKey("owner", "assumed-role/r/s", time.Now().Add(time.Minute))
		req, body := signedRequest(t, KMS, id, secret, token)

		// Action
		got, err := authenticate(KMS, req, body)

		// Assert
		require.Nil(t, err)
		require.Equal(t, id, got)
	})

	t.Run("should refuse a session key at its deadline the way each protocol reports an expired token", func(t *testing.T) {
		for _, tc := range []struct {
			svc    service
			status int
			code   string
		}{
			{KMS, http.StatusBadRequest, "ExpiredTokenException"},
			{STS, http.StatusForbidden, "ExpiredToken"},
		} {
			// Setup
			id, secret, token := issueSessionKey("owner", "assumed-role/r/s", time.Now())
			req, body := signedRequest(t, tc.svc, id, secret, token)

			// Action
			_, err := authenticate(tc.svc, req, body)

			// Assert
			require.NotNil(t, err, tc.svc.name)
			require.Equal(t, tc.status, err.status, tc.svc.name)
			require.Equal(t, tc.code, err.code, tc.svc.name)
		}
	})
}
