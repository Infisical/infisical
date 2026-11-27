package powerdns

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func TestServer_Release(t *testing.T) {
	const name = "_acme-challenge.release.test"
	seed := []byte(`{"keyAccepted": true, "zones": {"release.test.": {"name": "release.test.", "serial": 1}}}`)
	patch := func(t *testing.T, s *Server, body string) {
		t.Helper()
		w := httptest.NewRecorder()
		s.ServeHTTP(w, httptest.NewRequest(http.MethodPatch, "/api/v1/servers/localhost/zones/release.test.", strings.NewReader(body)))
		require.Equal(t, http.StatusNoContent, w.Code, w.Body.String())
	}
	publish := func(t *testing.T, s *Server, value string) {
		t.Helper()
		patch(t, s, `{"rrsets": [{"name": "`+name+`.", "type": "TXT", "ttl": 60, "changetype": "REPLACE", "records": [{"content": "\"`+value+`\""}]}]}`)
	}

	t.Run("should withdraw the TXT answer when the RRset is deleted", func(t *testing.T) {
		// Setup
		srv := fakenet.New()
		s := service{}.New(srv.Emitter(Service.Host(), "a")).(*Server)
		require.NoError(t, s.Seed(seed))
		publish(t, s, "token-a")
		require.Equal(t, []string{"token-a"}, srv.Emitter("", "").LookupTXT(name))

		// Action
		patch(t, s, `{"rrsets": [{"name": "`+name+`.", "type": "TXT", "changetype": "DELETE"}]}`)

		// Assert
		require.Empty(t, srv.Emitter("", "").LookupTXT(name))
	})

	t.Run("should withdraw a written TXT answer when its zone is reseeded", func(t *testing.T) {
		// Setup
		srv := fakenet.New()
		s := service{}.New(srv.Emitter(Service.Host(), "a")).(*Server)
		require.NoError(t, s.Seed(seed))
		publish(t, s, "token-a")

		// Action
		require.NoError(t, s.Seed(seed))
		withdrawn := srv.Emitter("", "").LookupTXT(name)
		s.Release()

		// Assert
		require.Empty(t, withdrawn)
		require.Empty(t, srv.Emitter("", "").LookupTXT(name))
	})

	t.Run("should keep a TXT answer the reseeded zone still holds", func(t *testing.T) {
		// Setup
		srv := fakenet.New()
		s := service{}.New(srv.Emitter(Service.Host(), "a")).(*Server)
		require.NoError(t, s.Seed(seed))
		publish(t, s, "token-a")

		// Action
		require.NoError(t, s.Seed([]byte(`{"zones": {"release.test.": {"name": "release.test.", "serial": 2, "rrsets": [
			{"name": "`+name+`.", "type": "TXT", "ttl": 60, "records": [{"content": "\"token-a\""}]}]}}}`)))

		// Assert
		require.Equal(t, []string{"token-a"}, srv.Emitter("", "").LookupTXT(name))
	})

	t.Run("should serve only the value a PATCH commits when it replaces the same RRset twice", func(t *testing.T) {
		// Setup
		srv := fakenet.New()
		s := service{}.New(srv.Emitter(Service.Host(), "a")).(*Server)
		require.NoError(t, s.Seed(seed))

		// Action
		patch(t, s, `{"rrsets": [
			{"name": "`+name+`.", "type": "TXT", "ttl": 60, "changetype": "REPLACE", "records": [{"content": "\"intermediate\""}]},
			{"name": "`+name+`.", "type": "TXT", "ttl": 60, "changetype": "REPLACE", "records": [{"content": "\"committed\""}]}]}`)

		// Assert
		require.Equal(t, []string{"committed"}, srv.Emitter("", "").LookupTXT(name))
	})

	t.Run("should withdraw the TXT answer on release and not republish it from a request that runs after", func(t *testing.T) {
		// Setup
		srv := fakenet.New()
		s := service{}.New(srv.Emitter(Service.Host(), "a")).(*Server)
		require.NoError(t, s.Seed(seed))
		publish(t, s, "token-a")
		require.Equal(t, []string{"token-a"}, srv.Emitter("", "").LookupTXT(name))

		// Action
		s.Release()
		publish(t, s, "token-late")

		// Assert
		require.Empty(t, srv.Emitter("", "").LookupTXT(name))
	})

	t.Run("should not publish from a reseed that runs after release", func(t *testing.T) {
		// Setup
		srv := fakenet.New()
		s := service{}.New(srv.Emitter(Service.Host(), "a")).(*Server)
		require.NoError(t, s.Seed([]byte(`{"zones": {"release.test.": {"name": "release.test.", "serial": 1, "rrsets": [
			{"name": "`+name+`.", "type": "TXT", "ttl": 60, "records": [{"content": "\"disabled\"", "disabled": true}]}]}}}`)))

		// Action
		s.Release()
		require.NoError(t, s.Seed([]byte(`{"zones": {"release.test.": {"name": "release.test.", "serial": 2, "rrsets": [
			{"name": "`+name+`.", "type": "TXT", "ttl": 60, "records": [{"content": "\"token-late\""}]}]}}}`)))

		// Assert
		require.Empty(t, srv.Emitter("", "").LookupTXT(name))
	})

	t.Run("should leave another publisher's later TXT answer on release", func(t *testing.T) {
		// Setup
		srv := fakenet.New()
		a := service{}.New(srv.Emitter(Service.Host(), "a")).(*Server)
		b := service{}.New(srv.Emitter(Service.Host(), "b")).(*Server)
		require.NoError(t, a.Seed(seed))
		require.NoError(t, b.Seed(seed))
		publish(t, a, "token-a")
		publish(t, b, "token-b")

		// Action
		a.Release()

		// Assert
		require.Equal(t, []string{"token-b"}, srv.Emitter("", "").LookupTXT(name))
	})
}
