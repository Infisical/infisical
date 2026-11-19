// Package id generates the identifiers fixtures need.
//
// Shared because every fixture package names something, and two packages rolling
// their own would eventually disagree on length or alphabet in a way that only
// shows up as a collision under -count=3.
package id

import (
	"crypto/rand"
	"encoding/hex"
)

// Short is a name suffix, unique enough that two parallel tests creating "app" do
// not collide.
func Short() string { return random(4) }

// binary is shared by every nonce this test binary mints.
var binary = random(4)

// Binary is the prefix of every nonce from this process, so fakenet can send this
// binary only its own events while other packages run beside it.
func Binary() string { return binary }

// Nonce is a credential a fake can be keyed on.
//
// Unguessable is not the point; unique is. It is what tells one tenant's outbound
// requests from another's on a shared fakenet.
func Nonce() string { return binary + random(16) }

func random(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
