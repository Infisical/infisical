package acmeca_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/acmeca"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/acme"
)

func TestAcmeCAFake_Revoke(t *testing.T) {
	t.Run("should record a revocation by the account that ordered the certificate", func(t *testing.T) {
		// Setup
		client, ca, admin := newCA(t, "revoke")
		ctx := t.Context()
		_, err := client.Register(ctx, &acme.Account{}, acme.AcceptTOS)
		require.NoError(t, err)
		order, err := client.AuthorizeOrder(ctx, acme.DomainIDs("r.example.test"))
		require.NoError(t, err)
		answer(t, client, admin, order, nil)
		order, err = client.WaitOrder(ctx, order.URI)
		require.NoError(t, err)
		chain, _, err := client.CreateOrderCert(ctx, order.FinalizeURL, csrFor(t, "r.example.test"), true)
		require.NoError(t, err)

		// Action
		err = client.RevokeCert(ctx, nil, chain[0], acme.CRLReasonKeyCompromise)

		// Assert
		require.NoError(t, err)
		issued := ca.State(t).Issued[0]
		require.NotNil(t, issued.RevokedAt)
		require.Equal(t, int(acme.CRLReasonKeyCompromise), issued.Reason)
		ca.ExpectEvent[acmeca.CertificateRevoked](t, nil)
	})
}
