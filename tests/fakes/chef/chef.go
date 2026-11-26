// Package chef fakes the Chef Infra Server API on api.chef.io: one user's organization
// and its data bags.
//
// Requests are authenticated the way Chef does it, with the version 1.3 signed
// headers: the body's SHA-256 must match X-Ops-Content-Hash, and the canonical request
// must verify against the public key seeded for the user named in X-Ops-UserId.
package chef

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

type service struct{}

// Service answers as api.chef.io, the server Infisical uses when a connection names
// none.
var Service = service{}

func (service) Host() string { return "api.chef.io" }

// Scope is the user the request is signed as.
func (service) Scope(r *http.Request) (string, bool) {
	u := r.Header.Get("X-Ops-UserId")
	return u, u != ""
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	u := &User{DataBags: map[string]map[string]map[string]any{}, events: events}
	u.mux = http.NewServeMux()
	u.mux.HandleFunc("GET /organizations/{org}/users/{user}", u.getUser)
	u.mux.HandleFunc("GET /organizations/{org}/data", u.listBags)
	u.mux.HandleFunc("GET /organizations/{org}/data/{bag}", u.listItems)
	u.mux.HandleFunc("POST /organizations/{org}/data/{bag}", u.createItem)
	u.mux.HandleFunc("GET /organizations/{org}/data/{bag}/{item}", u.getItem)
	u.mux.HandleFunc("PUT /organizations/{org}/data/{bag}/{item}", u.putItem)
	u.mux.HandleFunc("DELETE /organizations/{org}/data/{bag}/{item}", u.deleteItem)
	return u
}

// User is a Chef user, the organization it belongs to, and that organization's data
// bags.
type User struct {
	// PublicKey is the PEM public key the user's requests must verify against.
	PublicKey string `json:"publicKey"`
	// Organization is the one organization the user can reach.
	Organization string `json:"organization"`
	// DataBags maps a bag name to its items, each item a JSON object with an "id".
	DataBags map[string]map[string]map[string]any `json:"dataBags"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
}

type ItemDetail struct {
	Bag  string `json:"bag"`
	Item string `json:"item"`
}

type DataBagItemCreated struct{ ItemDetail }
type DataBagItemUpdated struct{ ItemDetail }
type DataBagItemDeleted struct{ ItemDetail }

func (DataBagItemCreated) EventName() string { return "chef.data-bag-item-created" }
func (DataBagItemUpdated) EventName() string { return "chef.data-bag-item-updated" }
func (DataBagItemDeleted) EventName() string { return "chef.data-bag-item-deleted" }

// WithUser is a seed fragment naming the user's organization and public key.
func WithUser(organization, publicKeyPEM string) any {
	return map[string]any{"organization": organization, "publicKey": publicKeyPEM}
}

// WithDataBag is a seed fragment creating an empty data bag.
func WithDataBag(name string) any {
	return map[string]any{"dataBags": map[string]any{name: map[string]any{}}}
}

func (u *User) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		chefError(w, http.StatusBadRequest, "could not read the request body")
		return
	}
	if msg := u.authenticate(r, body); msg != "" {
		chefError(w, http.StatusUnauthorized, msg)
		return
	}
	r.Body = io.NopCloser(strings.NewReader(string(body)))
	u.mux.ServeHTTP(w, r)
}

// authenticate checks the signed headers and returns why they were refused, or "".
func (u *User) authenticate(r *http.Request, body []byte) string {
	if r.Header.Get("X-Ops-Sign") != "version=1.3" {
		return "Failed to authenticate as " + r.Header.Get("X-Ops-UserId") + ". Unsupported X-Ops-Sign."
	}
	sum := sha256.Sum256(body)
	hash := base64.StdEncoding.EncodeToString(sum[:])
	if r.Header.Get("X-Ops-Content-Hash") != hash {
		return "Failed to authenticate: content hash does not match the body"
	}
	ts, err := time.Parse(time.RFC3339, r.Header.Get("X-Ops-Timestamp"))
	if err != nil || time.Since(ts).Abs() > 15*time.Minute {
		return "Failed to authenticate as " + r.Header.Get("X-Ops-UserId") + ". Synchronize the clock on your host."
	}
	u.mu.Lock()
	keyPEM := u.PublicKey
	u.mu.Unlock()
	key, ok := parsePublicKey(keyPEM)
	if !ok {
		return "Failed to authenticate as '" + r.Header.Get("X-Ops-UserId") + "'. Ensure that your node_name and client key are correct."
	}
	var sig strings.Builder
	for i := 1; ; i++ {
		part := r.Header.Get("X-Ops-Authorization-" + strconv.Itoa(i))
		if part == "" {
			break
		}
		sig.WriteString(part)
	}
	raw, err := base64.StdEncoding.DecodeString(sig.String())
	if err != nil {
		return "Failed to authenticate: malformed X-Ops-Authorization headers"
	}
	canonical := strings.Join([]string{
		"Method:" + r.Method,
		"Path:" + r.URL.Path,
		"X-Ops-Content-Hash:" + hash,
		"X-Ops-Sign:version=1.3",
		"X-Ops-Timestamp:" + r.Header.Get("X-Ops-Timestamp"),
		"X-Ops-UserId:" + r.Header.Get("X-Ops-UserId"),
		"X-Ops-Server-API-Version:" + r.Header.Get("X-Ops-Server-API-Version"),
	}, "\n")
	digest := sha256.Sum256([]byte(canonical))
	if rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], raw) != nil {
		return "Failed to authenticate as '" + r.Header.Get("X-Ops-UserId") + "'. Ensure that your node_name and client key are correct."
	}
	return ""
}

func parsePublicKey(p string) (*rsa.PublicKey, bool) {
	block, _ := pem.Decode([]byte(p))
	if block == nil {
		return nil, false
	}
	if k, err := x509.ParsePKIXPublicKey(block.Bytes); err == nil {
		rk, ok := k.(*rsa.PublicKey)
		return rk, ok
	}
	k, err := x509.ParsePKCS1PublicKey(block.Bytes)
	return k, err == nil
}

func (u *User) orgMatches(w http.ResponseWriter, r *http.Request) bool {
	u.mu.Lock()
	org := u.Organization
	u.mu.Unlock()
	if r.PathValue("org") != org {
		chefError(w, http.StatusNotFound, "organization '"+r.PathValue("org")+"' does not exist.")
		return false
	}
	return true
}

func (u *User) getUser(w http.ResponseWriter, r *http.Request) {
	if !u.orgMatches(w, r) {
		return
	}
	if r.PathValue("user") != r.Header.Get("X-Ops-UserId") {
		chefError(w, http.StatusNotFound, "Cannot find a user "+r.PathValue("user"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"username": r.PathValue("user"), "display_name": r.PathValue("user")})
}

func (u *User) listBags(w http.ResponseWriter, r *http.Request) {
	if !u.orgMatches(w, r) {
		return
	}
	u.mu.Lock()
	out := map[string]string{}
	for name := range u.DataBags {
		out[name] = "https://" + Service.Host() + "/organizations/" + r.PathValue("org") + "/data/" + name
	}
	u.mu.Unlock()
	writeJSON(w, http.StatusOK, out)
}

func (u *User) listItems(w http.ResponseWriter, r *http.Request) {
	if !u.orgMatches(w, r) {
		return
	}
	bag := r.PathValue("bag")
	u.mu.Lock()
	items, ok := u.DataBags[bag]
	names := make([]string, 0, len(items))
	for name := range items {
		names = append(names, name)
	}
	u.mu.Unlock()
	if !ok {
		missingBag(w, bag)
		return
	}
	sort.Strings(names)
	out := map[string]string{}
	for _, name := range names {
		out[name] = "https://" + Service.Host() + "/organizations/" + r.PathValue("org") + "/data/" + bag + "/" + name
	}
	writeJSON(w, http.StatusOK, out)
}

func (u *User) createItem(w http.ResponseWriter, r *http.Request) {
	if !u.orgMatches(w, r) {
		return
	}
	bag := r.PathValue("bag")
	item, ok := decodeItem(w, r)
	if !ok {
		return
	}
	name, _ := item["id"].(string)
	if name == "" {
		chefError(w, http.StatusBadRequest, "Field 'id' missing")
		return
	}
	u.mu.Lock()
	items, known := u.DataBags[bag]
	_, exists := items[name]
	if known && !exists {
		items[name] = item
	}
	u.mu.Unlock()
	switch {
	case !known:
		missingBag(w, bag)
	case exists:
		chefError(w, http.StatusConflict, "Data Bag Item '"+name+"' already exists in Data Bag '"+bag+"'.")
	default:
		u.events.Publish(DataBagItemCreated{ItemDetail{Bag: bag, Item: name}})
		writeJSON(w, http.StatusCreated, item)
	}
}

func (u *User) getItem(w http.ResponseWriter, r *http.Request) {
	if !u.orgMatches(w, r) {
		return
	}
	bag, name := r.PathValue("bag"), r.PathValue("item")
	u.mu.Lock()
	item, ok := u.DataBags[bag][name]
	u.mu.Unlock()
	if !ok {
		missingItem(w, bag, name)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (u *User) putItem(w http.ResponseWriter, r *http.Request) {
	if !u.orgMatches(w, r) {
		return
	}
	bag, name := r.PathValue("bag"), r.PathValue("item")
	item, ok := decodeItem(w, r)
	if !ok {
		return
	}
	if id, _ := item["id"].(string); id != "" && id != name {
		chefError(w, http.StatusBadRequest, "DataBagItem name mismatch.")
		return
	}
	item["id"] = name
	u.mu.Lock()
	_, exists := u.DataBags[bag][name]
	if exists {
		u.DataBags[bag][name] = item
	}
	u.mu.Unlock()
	if !exists {
		missingItem(w, bag, name)
		return
	}
	u.events.Publish(DataBagItemUpdated{ItemDetail{Bag: bag, Item: name}})
	writeJSON(w, http.StatusOK, item)
}

func (u *User) deleteItem(w http.ResponseWriter, r *http.Request) {
	if !u.orgMatches(w, r) {
		return
	}
	bag, name := r.PathValue("bag"), r.PathValue("item")
	u.mu.Lock()
	item, exists := u.DataBags[bag][name]
	if exists {
		delete(u.DataBags[bag], name)
	}
	u.mu.Unlock()
	if !exists {
		missingItem(w, bag, name)
		return
	}
	u.events.Publish(DataBagItemDeleted{ItemDetail{Bag: bag, Item: name}})
	writeJSON(w, http.StatusOK, item)
}

func decodeItem(w http.ResponseWriter, r *http.Request) (map[string]any, bool) {
	var item map[string]any
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil || item == nil {
		chefError(w, http.StatusBadRequest, "Data Bag Item must be a JSON object")
		return nil, false
	}
	return item, true
}

func missingBag(w http.ResponseWriter, bag string) {
	chefError(w, http.StatusNotFound, "Cannot load data bag "+bag)
}

func missingItem(w http.ResponseWriter, bag, name string) {
	chefError(w, http.StatusNotFound, fmt.Sprintf("Cannot load data bag item %s for data bag %s", name, bag))
}

func chefError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": []string{msg}})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func (u *User) Snapshot() ([]byte, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	return json.Marshal(struct {
		PublicKey    string                               `json:"publicKey"`
		Organization string                               `json:"organization"`
		DataBags     map[string]map[string]map[string]any `json:"dataBags"`
	}{u.PublicKey, u.Organization, u.DataBags})
}

func (u *User) Seed(raw []byte) error {
	var in struct {
		PublicKey    string                               `json:"publicKey"`
		Organization string                               `json:"organization"`
		DataBags     map[string]map[string]map[string]any `json:"dataBags"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	u.mu.Lock()
	defer u.mu.Unlock()
	if in.PublicKey != "" {
		u.PublicKey = in.PublicKey
	}
	if in.Organization != "" {
		u.Organization = in.Organization
	}
	for bag, items := range in.DataBags {
		if u.DataBags[bag] == nil {
			u.DataBags[bag] = map[string]map[string]any{}
		}
		for name, item := range items {
			u.DataBags[bag][name] = item
		}
	}
	return nil
}
