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

// Nonce is a credential a stub can be keyed on.
//
// Unguessable is not the point; unique is. It is what tells one tenant's outbound
// requests from another's in a shared request journal.
func Nonce() string { return random(16) }

func random(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
