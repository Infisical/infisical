package aws

import (
	"encoding/json"
	"net/http"
	"regexp"
	"slices"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// IAMAccount is one account's IAM users and their access keys.
type IAMAccount struct {
	Policy
	Users map[string]*User `json:"users"`

	mu     sync.Mutex
	events fakenet.Emitter
	h      handler
}

type User struct {
	UserName   string      `json:"userName"`
	UserID     string      `json:"userId"`
	CreateDate time.Time   `json:"createDate"`
	AccessKeys []AccessKey `json:"accessKeys"`
}

// AccessKey carries its secret so a test can tell which credential a product published.
type AccessKey struct {
	AccessKeyID     string    `json:"accessKeyId"`
	SecretAccessKey string    `json:"secretAccessKey"`
	Status          string    `json:"status"`
	CreateDate      time.Time `json:"createDate"`
}

// accessKeysPerUser is IAM's hard quota.
const accessKeysPerUser = 2

func newIAM(svc service, events fakenet.Emitter) fakenet.Fake {
	a := &IAMAccount{Users: map[string]*User{}, events: events}
	a.h = handler{svc: svc, mu: &a.mu, policy: func() *Policy { return &a.Policy }, actions: map[string]func(call) (any, *apiError){
		"CreateUser":      a.createUser,
		"DeleteUser":      a.deleteUser,
		"ListAccessKeys":  a.listAccessKeys,
		"CreateAccessKey": a.createAccessKey,
		"DeleteAccessKey": a.deleteAccessKey,
	}}
	return a
}

func (a *IAMAccount) ServeHTTP(w http.ResponseWriter, r *http.Request) { a.h.serve(w, r) }

func (a *IAMAccount) Snapshot() ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return json.Marshal(struct {
		Policy
		Users map[string]*User `json:"users"`
	}{a.Policy, a.Users})
}

// Seed merges users, and any keys they already hold, that exist before Infisical
// touches the account. A seeded key with no secret gets the derived one, so it signs
// like a credential a test invented. A removed access key is deleted the way an
// operator deletes one in the console: behind Infisical's back.
func (a *IAMAccount) Seed(raw []byte) error {
	var in struct {
		Policy
		Users             map[string]*User `json:"users"`
		RemovedAccessKeys []string         `json:"removedAccessKeys"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.merge(in.Policy)
	for name, u := range in.Users {
		u.UserName = name
		if u.UserID == "" {
			u.UserID = "AIDA" + randomBase32(16)
		}
		if u.CreateDate.IsZero() {
			u.CreateDate = now()
		}
		for i := range u.AccessKeys {
			k := &u.AccessKeys[i]
			if k.SecretAccessKey == "" {
				k.SecretAccessKey = SecretAccessKey(k.AccessKeyID)
			}
			if k.Status == "" {
				k.Status = "Active"
			}
			if k.CreateDate.IsZero() {
				k.CreateDate = u.CreateDate
			}
			registerSeededKey(k.AccessKeyID, name, k.SecretAccessKey, k.Status == "Active")
		}
		if existing, ok := a.Users[name]; ok {
			existing.AccessKeys = append(existing.AccessKeys, u.AccessKeys...)
			continue
		}
		a.Users[name] = u
	}
	for _, id := range in.RemovedAccessKeys {
		for _, u := range a.Users {
			u.AccessKeys = slices.DeleteFunc(u.AccessKeys, func(k AccessKey) bool { return k.AccessKeyID == id })
		}
		revokeKey(id)
	}
	return nil
}

// registerSeededKey puts a seeded key in the keyring as its own owner, so it scopes to
// itself and a later delete still revokes it everywhere.
func registerSeededKey(id, user, secret string, active bool) {
	keyring.mu.Lock()
	defer keyring.mu.Unlock()
	keyring.keys[id] = &issued{owner: id, user: user, secret: secret, active: active}
}

var userNamePattern = regexp.MustCompile(`^[\w+=,.@-]{1,64}$`)

func (a *IAMAccount) user(c call) (*User, *apiError) {
	name := c.form.Get("UserName")
	if name == "" {
		return nil, errf(http.StatusBadRequest, "ValidationError",
			"1 validation error detected: Value null at 'userName' failed to satisfy constraint: Member must not be null")
	}
	u, ok := a.Users[name]
	if !ok {
		return nil, errf(http.StatusNotFound, "NoSuchEntity", "The user with name %s cannot be found.", name)
	}
	return u, nil
}

type xmlUser struct {
	Path       string `xml:"Path"`
	UserName   string `xml:"UserName"`
	UserID     string `xml:"UserId"`
	Arn        string `xml:"Arn"`
	CreateDate string `xml:"CreateDate"`
}

func iso(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05Z") }

func (a *IAMAccount) createUser(c call) (any, *apiError) {
	name := c.form.Get("UserName")
	if !userNamePattern.MatchString(name) {
		return nil, errf(http.StatusBadRequest, "ValidationError",
			"The specified value for userName is invalid. It must contain only alphanumeric characters and/or the following: +=,.@_-")
	}
	if _, ok := a.Users[name]; ok {
		return nil, errf(http.StatusConflict, "EntityAlreadyExists", "User with name %s already exists.", name)
	}
	u := &User{UserName: name, UserID: "AIDA" + randomBase32(16), CreateDate: now(), AccessKeys: []AccessKey{}}
	a.Users[name] = u
	a.events.Publish(UserCreated{UserDetail{UserName: name}})
	return struct {
		User xmlUser `xml:"User"`
	}{xmlUser{"/", u.UserName, u.UserID, "arn:aws:iam::" + c.account() + ":user/" + u.UserName, iso(u.CreateDate)}}, nil
}

func (a *IAMAccount) deleteUser(c call) (any, *apiError) {
	u, err := a.user(c)
	if err != nil {
		return nil, err
	}
	if len(u.AccessKeys) > 0 {
		return nil, errf(http.StatusConflict, "DeleteConflict", "Cannot delete entity, must delete access keys first.")
	}
	delete(a.Users, u.UserName)
	a.events.Publish(UserDeleted{UserDetail{UserName: u.UserName}})
	return nil, nil
}

type xmlAccessKeyMetadata struct {
	UserName    string `xml:"UserName"`
	AccessKeyID string `xml:"AccessKeyId"`
	Status      string `xml:"Status"`
	CreateDate  string `xml:"CreateDate"`
}

// listAccessKeys answers in creation order. Two keys made in the same second carry
// the same CreateDate, and creation order is what a stable sort then keeps.
func (a *IAMAccount) listAccessKeys(c call) (any, *apiError) {
	u, err := a.user(c)
	if err != nil {
		return nil, err
	}
	out := make([]xmlAccessKeyMetadata, 0, len(u.AccessKeys))
	for _, k := range u.AccessKeys {
		out = append(out, xmlAccessKeyMetadata{u.UserName, k.AccessKeyID, k.Status, iso(k.CreateDate)})
	}
	return struct {
		AccessKeyMetadata []xmlAccessKeyMetadata `xml:"AccessKeyMetadata>member"`
		IsTruncated       bool                   `xml:"IsTruncated"`
	}{out, false}, nil
}

type xmlAccessKey struct {
	UserName        string `xml:"UserName"`
	AccessKeyID     string `xml:"AccessKeyId"`
	Status          string `xml:"Status"`
	SecretAccessKey string `xml:"SecretAccessKey"`
	CreateDate      string `xml:"CreateDate"`
}

func (a *IAMAccount) createAccessKey(c call) (any, *apiError) {
	u, err := a.user(c)
	if err != nil {
		return nil, err
	}
	if len(u.AccessKeys) >= accessKeysPerUser {
		return nil, errf(http.StatusConflict, "LimitExceeded", "Cannot exceed quota for AccessKeysPerUser: %d", accessKeysPerUser)
	}
	id, secret := issueKey(c.owner, u.UserName)
	k := AccessKey{AccessKeyID: id, SecretAccessKey: secret, Status: "Active", CreateDate: now()}
	u.AccessKeys = append(u.AccessKeys, k)
	a.events.Publish(AccessKeyCreated{AccessKeyDetail{UserName: u.UserName, AccessKeyID: id}})
	return struct {
		AccessKey xmlAccessKey `xml:"AccessKey"`
	}{xmlAccessKey{u.UserName, id, k.Status, secret, iso(k.CreateDate)}}, nil
}

func (a *IAMAccount) deleteAccessKey(c call) (any, *apiError) {
	u, err := a.user(c)
	if err != nil {
		return nil, err
	}
	id := c.form.Get("AccessKeyId")
	i := slices.IndexFunc(u.AccessKeys, func(k AccessKey) bool { return k.AccessKeyID == id })
	if i < 0 {
		return nil, errf(http.StatusNotFound, "NoSuchEntity", "The Access Key with id %s cannot be found.", id)
	}
	u.AccessKeys = slices.Delete(u.AccessKeys, i, i+1)
	revokeKey(id)
	a.events.Publish(AccessKeyDeleted{AccessKeyDetail{UserName: u.UserName, AccessKeyID: id}})
	return nil, nil
}
