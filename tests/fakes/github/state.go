// Package github fakes the parts of GitHub's API that Infisical calls.
//
// One fake for the service, not one per feature. App connections, secret sync,
// rotation and scanning all talk to the same GitHub with the same credential, so
// splitting them would mean two things claiming to be GitHub and free to disagree.
package github

import (
	"net/http"
	"sync"
	"time"
)

// Account is one GitHub account, addressed by the token a test invented.
type Account struct {
	Login  string            `json:"login"`
	Stores map[string]*Store `json:"stores"`

	mu  sync.Mutex
	mux *http.ServeMux
}

// Store is a bag of Actions secrets.
//
// GitHubSyncScope has three values and they differ only in the path they address, so
// one type covers all of them:
//
//	orgs/acme                  organization secrets
//	repos/acme/app             repository secrets
//	repos/acme/app/envs/prod   repository environment secrets
type Store struct {
	KeyID   string            `json:"keyId"`
	Secrets map[string]Secret `json:"secrets"`

	// Unexported so the admin API never carries the private half. GitHub issues a
	// public key per scope and takes a sealed box, and holding the other half is
	// what lets a test assert on the plaintext that was actually delivered.
	pub  *[32]byte
	priv *[32]byte
}

type Secret struct {
	Value     string    `json:"value"`
	UpdatedAt time.Time `json:"updatedAt"`
}
