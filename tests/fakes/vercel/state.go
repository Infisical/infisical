// Package vercel fakes the parts of Vercel's API that Infisical calls: the token check
// an App Connection makes, and a project's environment variables, which a project-scope
// secret sync writes.
//
// Team-scope shared environment variables are not modelled yet; a sync with that scope
// gets a 404 here rather than a fake that pretends.
package vercel

import (
	"net/http"
	"sync"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Account is one Vercel account, addressed by the API token a test invented.
type Account struct {
	Username string              `json:"username"`
	Projects map[string]*Project `json:"projects"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
	nextID int
}

// Project holds a project's environment variables. Vercel allows several records with
// the same key as long as their targets and branches do not overlap, so this is a list,
// not a map by key.
type Project struct {
	Envs []Env `json:"envs"`
}

// Env is one environment variable record. Value is the plaintext, which Vercel itself
// only returns for some types and routes; the admin API carries it so a test can assert
// on what was delivered.
type Env struct {
	ID                   string   `json:"id"`
	Key                  string   `json:"key"`
	Value                string   `json:"value"`
	Type                 string   `json:"type"`
	Target               []string `json:"target"`
	CustomEnvironmentIDs []string `json:"customEnvironmentIds,omitempty"`
	GitBranch            string   `json:"gitBranch,omitempty"`
	CreatedAt            int64    `json:"createdAt"`
	UpdatedAt            int64    `json:"updatedAt"`
}
