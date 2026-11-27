package ultradns

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func TestAccount_TXT(t *testing.T) {
	const name = "_acme-challenge.www.example.test"
	seed, err := json.Marshal(WithZone("example.test"))
	require.NoError(t, err)
	newAccount := func(t *testing.T) (*fakenet.Server, *Account) {
		t.Helper()
		srv := fakenet.New()
		a := Service.New(srv.Emitter(Service.Host(), "u1")).(*Account)
		require.NoError(t, a.Seed(seed))
		a.tokens["t1"] = true
		return srv, a
	}
	serve := func(t *testing.T, a *Account, method, body string) {
		t.Helper()
		r := httptest.NewRequest(method, "/v1/zones/example.test./rrsets/TXT/"+name+".", strings.NewReader(body))
		r.Header.Set("Authorization", "Bearer t1")
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		require.Less(t, w.Code, 300, w.Body.String())
	}
	const rrset = `{"ttl":60,"rdata":["\"token\""]}`

	t.Run("should serve a created TXT answer and withdraw it when the RRset is deleted", func(t *testing.T) {
		// Setup
		srv, a := newAccount(t)

		// Action
		serve(t, a, http.MethodPost, rrset)
		served := srv.Emitter("", "").LookupTXT(name)
		serve(t, a, http.MethodDelete, "")

		// Assert
		require.Equal(t, []string{"token"}, served)
		require.Empty(t, srv.Emitter("", "").LookupTXT(name))
	})

	t.Run("should withdraw a created TXT answer when its zone is reseeded", func(t *testing.T) {
		// Setup
		srv, a := newAccount(t)
		serve(t, a, http.MethodPost, rrset)

		// Action
		require.NoError(t, a.Seed(seed))
		withdrawn := srv.Emitter("", "").LookupTXT(name)
		a.Release()

		// Assert
		require.Empty(t, withdrawn)
		require.Empty(t, srv.Emitter("", "").LookupTXT(name))
	})
}
