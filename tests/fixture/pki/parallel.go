package pki

import (
	"flag"
	"fmt"
	"os"
	"strconv"
)

// maxParallel is the most tests a PKI package runs at once. PKI issuance and sync jobs
// each hold database connections, and above this the shared instance's pool times out
// and issuance answers 500 (tests/docs/debugging.md).
const maxParallel = 4

// CapParallel lowers -test.parallel to maxParallel, keeping any lower value, and says so
// when the value lowered was one the caller passed. Call it first in TestMain, before
// harness.Main runs the tests.
func CapParallel() {
	flag.Parse()
	f := flag.Lookup("test.parallel")
	n, err := strconv.Atoi(f.Value.String())
	if err != nil || n <= maxParallel {
		return
	}
	_ = f.Value.Set(strconv.Itoa(maxParallel))
	flag.Visit(func(set *flag.Flag) {
		if set.Name == f.Name {
			fmt.Fprintf(os.Stderr, "pki: running %d tests at once, not the %d -parallel asked for (tests/docs/debugging.md)\n", maxParallel, n)
		}
	})
}
