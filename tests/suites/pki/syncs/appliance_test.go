package syncs_test

import (
	"encoding/pem"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/stretchr/testify/require"
)

// applianceObjectName is the name a destination gives a certificate under the
// Infisical-{{certificateId}} schema.
func applianceObjectName(cert pki.Certificate) string {
	return "Infisical-" + strings.ReplaceAll(cert.ID.String(), "-", "")
}

// syncedIntermediate is the certificate's issuing CA, the one chain certificate a
// sync delivers: the root is left out of synced chains.
func syncedIntermediate(t *testing.T, cert pki.Certificate) string {
	t.Helper()
	block, _ := pem.Decode([]byte(cert.Chain))
	require.NotNil(t, block, "the certificate has no chain")
	return strings.TrimSpace(string(pem.EncodeToMemory(block)))
}
