package venafitpp_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/internal/issuer"
	"github.com/stretchr/testify/require"
)

func TestVenafiTppFake_Reenroll(t *testing.T) {
	t.Run("should re-enroll an existing object and count both requests", func(t *testing.T) {
		// Setup
		fakes, tpp := newServer(t, "s1")
		token := login(t, fakes)
		req := func() int {
			status, _ := call(t, fakes, token, "POST", "/s1/vedsdk/certificates/request", `{"PolicyDN":"\\VED\\Policy\\Certs","ObjectName":"r.test","PKCS10":`+jsonString(issuer.TestCSR(t, "r.test"))+`}`)
			return status
		}
		require.Equal(t, http.StatusOK, req())
		first := tpp.State(t).Certificates[`\VED\Policy\Certs\r.test`].PEM

		// Action
		status := req()

		// Assert
		require.Equal(t, http.StatusOK, status)
		got := tpp.State(t).Certificates[`\VED\Policy\Certs\r.test`]
		require.Equal(t, 2, got.Requests)
		require.Zero(t, got.Retrievals)
		require.NotEqual(t, first, got.PEM)
	})
}
