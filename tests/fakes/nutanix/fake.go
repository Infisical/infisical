// Package nutanix fakes the parts of Nutanix Prism Central's v4 API a certificate sync
// calls: the clusters, each cluster's one SSL certificate slot, and the tasks that
// replace it.
package nutanix

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// Service answers as one Prism Central.
//
// Prism Central runs on the customer's own network under a name they choose, so no
// host is hardcoded in Infisical. A fixed .test name stands in for it and reaches this
// fake through fakenet's DNS and CA, never by pointing the connection at fakenet.
var Service = service{host: "prism.nutanix.test"}

type service struct{ host string }

func (s service) Host() string { return s.host }

// Scope is the API key, or the basic auth user for a connection that logs in.
func (service) Scope(r *http.Request) (string, bool) {
	if key := r.Header.Get("X-ntnx-api-key"); key != "" {
		return key, true
	}
	user, _, ok := r.BasicAuth()
	return user, ok && user != ""
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	pc := &PrismCentral{Clusters: map[string]*Cluster{}, Tasks: map[string]*Task{}, events: events}
	pc.mux = http.NewServeMux()
	pc.mux.HandleFunc("GET /api/clustermgmt/v4.2/config/clusters", pc.listClusters)
	pc.mux.HandleFunc("GET /api/clustermgmt/v4.2/config/clusters/{id}/ssl-certificate", pc.getCertificate)
	pc.mux.HandleFunc("PUT /api/clustermgmt/v4.2/config/clusters/{id}/ssl-certificate", pc.putCertificate)
	pc.mux.HandleFunc("GET /api/prism/v4.0/config/tasks/{id}", pc.getTask)
	return pc
}

// PrismCentral is what one credential can reach.
type PrismCentral struct {
	Clusters map[string]*Cluster `json:"clusters"`
	Tasks    map[string]*Task    `json:"tasks"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
}

// Cluster holds the certificate Prism serves. Version is what its ETag is built from,
// so a PUT carrying a stale If-Match is refused the way Nutanix refuses one.
type Cluster struct {
	Name              string `json:"name"`
	PublicCertificate string `json:"publicCertificate,omitempty"`
	PrivateKey        string `json:"privateKey,omitempty"`
	CaChain           string `json:"caChain,omitempty"`
	KeyAlgorithm      string `json:"privateKeyAlgorithm,omitempty"`
	Version           int    `json:"version"`
}

// Task is an asynchronous operation. Certificate replacements finish at once.
type Task struct {
	Status string `json:"status"`
}

// WithCluster is a seed fragment for a cluster serving its factory certificate.
func WithCluster(id, name string) any {
	return PrismCentral{Clusters: map[string]*Cluster{id: {Name: name, Version: 1}}}
}

// Password is the one a basic auth user a test invented logs in with. Derived rather
// than registered, so a connection can be created before fakenet has heard of the user.
func Password(user string) string {
	sum := sha256.Sum256([]byte("infisical-fake-nutanix/" + user))
	return hex.EncodeToString(sum[:16])
}

func (pc *PrismCentral) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if user, pass, ok := r.BasicAuth(); ok && pass != Password(user) {
		writeError(w, http.StatusUnauthorized, "AUTH-10401", "Authentication failed")
		return
	}
	pc.mux.ServeHTTP(w, r)
}

func (pc *PrismCentral) Snapshot() ([]byte, error) {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	return json.Marshal(struct {
		Clusters map[string]*Cluster `json:"clusters"`
		Tasks    map[string]*Task    `json:"tasks"`
	}{pc.Clusters, pc.Tasks})
}

func (pc *PrismCentral) Seed(raw []byte) error {
	var in struct {
		Clusters map[string]*Cluster `json:"clusters"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	pc.mu.Lock()
	defer pc.mu.Unlock()
	for id, c := range in.Clusters {
		pc.Clusters[id] = c
	}
	return nil
}

func (pc *PrismCentral) listClusters(w http.ResponseWriter, _ *http.Request) {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	data := []map[string]any{}
	for id, c := range pc.Clusters {
		data = append(data, map[string]any{"extId": id, "name": c.Name, "$objectType": "clustermgmt.v4.config.Cluster"})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data, "metadata": map[string]any{"totalAvailableResults": len(data)}})
}

func etag(id string, c *Cluster) string { return fmt.Sprintf(`"%s-%d"`, id, c.Version) }

func (pc *PrismCentral) getCertificate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	pc.mu.Lock()
	defer pc.mu.Unlock()
	c, ok := pc.Clusters[id]
	if !ok {
		notFound(w, id)
		return
	}
	w.Header().Set("ETag", etag(id, c))
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"privateKeyAlgorithm": c.KeyAlgorithm,
		"publicCertificate":   c.PublicCertificate,
		"$objectType":         "clustermgmt.v4.config.SSLCertificate",
	}})
}

func (pc *PrismCentral) putCertificate(w http.ResponseWriter, r *http.Request) {
	clusterID := r.PathValue("id")
	var in struct {
		PrivateKeyAlgorithm string `json:"privateKeyAlgorithm"`
		PrivateKey          string `json:"privateKey"`
		PublicCertificate   string `json:"publicCertificate"`
		CaChain             string `json:"caChain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "CLU-10001", "Request body is not valid JSON")
		return
	}
	cert, cErr := base64.StdEncoding.DecodeString(in.PublicCertificate)
	key, kErr := base64.StdEncoding.DecodeString(in.PrivateKey)
	chain, chErr := base64.StdEncoding.DecodeString(in.CaChain)
	if cErr != nil || kErr != nil || chErr != nil || !strings.Contains(string(cert), "BEGIN CERTIFICATE") {
		writeError(w, http.StatusBadRequest, "CLU-10002", "publicCertificate, privateKey and caChain must be base64-encoded PEM")
		return
	}

	pc.mu.Lock()
	c, ok := pc.Clusters[clusterID]
	if !ok {
		pc.mu.Unlock()
		notFound(w, clusterID)
		return
	}
	if r.Header.Get("If-Match") != etag(clusterID, c) {
		pc.mu.Unlock()
		writeError(w, http.StatusPreconditionFailed, "CLU-10412", "The If-Match header does not match the current ETag of the resource")
		return
	}
	c.PublicCertificate, c.PrivateKey, c.CaChain, c.KeyAlgorithm = string(cert), string(key), string(chain), in.PrivateKeyAlgorithm
	c.Version++
	taskID := "ZXJnb24=:" + id.Hex(16)
	pc.Tasks[taskID] = &Task{Status: "SUCCEEDED"}
	pc.mu.Unlock()

	pc.events.Publish(CertificateReplaced{ClusterID: clusterID})
	writeJSON(w, http.StatusAccepted, map[string]any{"data": map[string]any{"extId": taskID, "$objectType": "prism.v4.config.TaskReference"}})
}

func (pc *PrismCentral) getTask(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	pc.mu.Lock()
	defer pc.mu.Unlock()
	t, ok := pc.Tasks[id]
	if !ok {
		notFound(w, id)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"extId": id, "status": t.Status, "$objectType": "prism.v4.config.Task"}})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"data": map[string]any{
		"error": []map[string]any{{"code": code, "message": message, "severity": "ERROR"}},
	}, "message": message})
}

func notFound(w http.ResponseWriter, id string) {
	writeError(w, http.StatusNotFound, "CLU-10404", "Entity with extId "+id+" not found")
}
