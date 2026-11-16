// Package offlineterminated_test boots with a validly signed offline license past its
// termination date.
package offlineterminated_test

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
)

func TestMain(m *testing.M) {
	signer, err := license.NewSigner()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	l := license.V2("harness-terminated", license.Enterprise())
	terminated := time.Now().UTC().Add(-24 * time.Hour).Truncate(time.Second)
	l.TerminatesAt = &terminated
	key, err := signer.Key(l)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	opts := []harness.Option{harness.WithInfisicalFile(signer.PublicKeyFile, license.PublicKeyPath)}
	for k, v := range license.SelfHostedEnv(key) {
		opts = append(opts, harness.WithInfisicalEnv(k, v))
	}
	harness.Main(m, harness.Isolated, opts...)
}
