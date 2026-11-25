// Package linuxserver fakes a Linux host reached over SSH, for the Linux Server
// certificate sync.
//
// SSH is not HTTP, so the host is served by its own listener in fakenet on port 22,
// under every hostname. The account is the scope: each connection invents a username,
// and every login, file and command goes to the host that username owns. The host is
// seeded and read over fakenet's admin API like any other fake, under the Host below.
package linuxserver

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"path"
	"sort"
	"strings"
	"sync"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Port is where fakenet serves SSH.
const Port = 22

// Service exists so a host can be opened and seeded through fakenet's admin API.
// Nothing reaches it over HTTP.
var Service = service{host: "ssh.linux.test"}

type service struct{ host string }

// Host is the name a connection points at. Any name resolves to fakenet, but the
// customer supplies the host, so one fixed name stands for it.
func (s service) Host() string { return s.host }

func (service) Scope(*http.Request) (string, bool) { return "", false }

func (service) New(events fakenet.Emitter) fakenet.Fake {
	return &Server{Files: map[string]*File{}, Directories: map[string]bool{}, events: events}
}

// Password is the password that goes with a username a test invented. Derived rather
// than registered, so a wrong password is refused the way sshd refuses one.
func Password(username string) string {
	sum := sha256.Sum256([]byte("infisical-fake-ssh/" + username))
	return hex.EncodeToString(sum[:])[:32]
}

// File is a regular file on the host.
type File struct {
	Content string `json:"content"`
	Mode    uint32 `json:"mode"`
	Owner   string `json:"owner"`
	Group   string `json:"group"`
}

// Server is one account's view of a Linux host: its directories and files, by absolute
// path.
type Server struct {
	Files       map[string]*File `json:"files"`
	Directories map[string]bool  `json:"directories"`

	mu     sync.Mutex
	events fakenet.Emitter
}

func (s *Server) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	http.Error(w, "SSH is not served over HTTP", http.StatusNotImplemented)
}

func (s *Server) Snapshot() ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return json.Marshal(struct {
		Files       map[string]*File `json:"files"`
		Directories map[string]bool  `json:"directories"`
	}{s.Files, s.Directories})
}

func (s *Server) Seed(raw []byte) error {
	var in struct {
		Files       map[string]*File `json:"files"`
		Directories []string         `json:"directories"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, d := range in.Directories {
		s.Directories[path.Clean(d)] = true
	}
	for p, f := range in.Files {
		s.Files[path.Clean(p)] = f
	}
	return nil
}

// owner is the account the host belongs to, which owns what it writes.
func (s *Server) owner() string { return s.events.Scope() }

// put stores a file whose parent directory exists, reporting false otherwise.
func (s *Server) put(p string, content []byte, mode uint32) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	p = path.Clean(p)
	if !s.Directories[path.Dir(p)] {
		return false
	}
	s.Files[p] = &File{Content: string(content), Mode: mode, Owner: s.owner(), Group: s.owner()}
	s.events.Publish(FileWritten{Path: p, Mode: mode})
	return true
}

func (s *Server) remove(p string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	p = path.Clean(p)
	if _, ok := s.Files[p]; !ok {
		return false
	}
	delete(s.Files, p)
	s.events.Publish(FileRemoved{Path: p})
	return true
}

// rename moves a file the way OpenSSH's SSH_FXP_RENAME does: it refuses to overwrite.
func (s *Server) rename(from, to string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	from, to = path.Clean(from), path.Clean(to)
	f, ok := s.Files[from]
	if !ok {
		return errNoSuchFile
	}
	if _, exists := s.Files[to]; exists || !s.Directories[path.Dir(to)] {
		return errFailure
	}
	delete(s.Files, from)
	s.Files[to] = f
	s.events.Publish(FileRenamed{From: from, To: to})
	return nil
}

func (s *Server) chown(p, owner, group string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, ok := s.Files[path.Clean(p)]
	if !ok {
		return false
	}
	if owner != "" {
		f.Owner = owner
	}
	if group != "" {
		f.Group = group
	}
	s.events.Publish(FileChowned{Path: path.Clean(p), Owner: f.Owner, Group: f.Group})
	return true
}

func (s *Server) stat(p string) (*File, bool, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p = path.Clean(p)
	if s.Directories[p] {
		return nil, true, true
	}
	f, ok := s.Files[p]
	if !ok {
		return nil, false, false
	}
	cp := *f
	return &cp, false, true
}

// list names the files directly inside a directory.
func (s *Server) list(dir string) ([]string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	dir = path.Clean(dir)
	if !s.Directories[dir] {
		return nil, false
	}
	var out []string
	for p := range s.Files {
		if path.Dir(p) == dir {
			out = append(out, strings.TrimPrefix(p, dir+"/"))
		}
	}
	sort.Strings(out)
	return out, true
}
