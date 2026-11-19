package linuxserver

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"path"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

// errNoSuchFile sends "no such file" with the status, as OpenSSH's sftp-server sends "No such
// file", rather than Go's "file does not exist": ssh2 surfaces the server's text, and Infisical
// matches it, ignoring case, to report a missing destination directory.
var (
	errNoSuchFile = sftp.ErrSSHFxNoSuchFile
	errFailure    = errors.New("failure")
)

// Lookup finds the host a username logs in to.
type Lookup func(username string) (*Server, bool)

// Serve answers SSH on addr: password logins, the sftp subsystem, and the chown
// command the Linux Server sync runs after writing a file.
func Serve(addr string, lookup Lookup) error {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	return ServeListener(ln, lookup)
}

// ServeListener is Serve on a listener the caller opened.
func ServeListener(ln net.Listener, lookup Lookup) error {
	// ECDSA P-256 because Infisical's SSH client offers no Ed25519 host key algorithm.
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return err
	}
	signer, err := ssh.NewSignerFromKey(key)
	if err != nil {
		return err
	}
	cfg := &ssh.ServerConfig{
		PasswordCallback: func(meta ssh.ConnMetadata, password []byte) (*ssh.Permissions, error) {
			if _, ok := lookup(meta.User()); !ok || string(password) != Password(meta.User()) {
				log.Printf("SSH    login %s -> refused", meta.User())
				return nil, fmt.Errorf("password rejected for %s", meta.User())
			}
			log.Printf("SSH    login %s -> ok", meta.User())
			return nil, nil
		},
	}
	cfg.AddHostKey(signer)
	for {
		conn, err := ln.Accept()
		if err != nil {
			return err
		}
		go handleConn(conn, cfg, lookup)
	}
}

func handleConn(conn net.Conn, cfg *ssh.ServerConfig, lookup Lookup) {
	defer func() { _ = conn.Close() }()
	_ = conn.SetDeadline(time.Now().Add(handshakeTimeout))
	sc, chans, reqs, err := ssh.NewServerConn(conn, cfg)
	if err != nil {
		return
	}
	_ = conn.SetDeadline(time.Time{})
	defer func() { _ = sc.Close() }()
	go ssh.DiscardRequests(reqs)
	host, ok := lookup(sc.User())
	if !ok {
		return
	}
	var wg sync.WaitGroup
	for nc := range chans {
		if nc.ChannelType() != "session" {
			_ = nc.Reject(ssh.UnknownChannelType, "only session channels are served")
			continue
		}
		ch, chReqs, err := nc.Accept()
		if err != nil {
			continue
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			handleSession(ch, chReqs, host)
		}()
	}
	wg.Wait()
}

func handleSession(ch ssh.Channel, reqs <-chan *ssh.Request, host *Server) {
	defer func() { _ = ch.Close() }()
	for req := range reqs {
		switch req.Type {
		case "subsystem":
			if payloadString(req.Payload) != "sftp" {
				_ = req.Reply(false, nil)
				continue
			}
			_ = req.Reply(true, nil)
			srv := sftp.NewRequestServer(ch, handlers(host))
			_ = srv.Serve()
			_ = srv.Close()
			return
		case "exec":
			_ = req.Reply(true, nil)
			stdout, stderr, status := run(host, payloadString(req.Payload))
			_, _ = ch.Write([]byte(stdout))
			_, _ = ch.Stderr().Write([]byte(stderr))
			_, _ = ch.SendRequest("exit-status", false, ssh.Marshal(struct{ Status uint32 }{status}))
			return
		default:
			_ = req.Reply(false, nil)
		}
	}
}

func payloadString(p []byte) string {
	if len(p) < 4 {
		return ""
	}
	n := binary.BigEndian.Uint32(p)
	if int(n) > len(p)-4 {
		return ""
	}
	return string(p[4 : 4+n])
}

// chownCommand is the command the sync runs to hand a written file to its owner,
// falling back to sudo: chown <owner>[:<group>] -- '<path>' 2>/dev/null || sudo -n chown ...
var chownCommand = regexp.MustCompile(`^chown ([a-z_][a-z0-9_-]*\$?)?(?::([a-z_][a-z0-9_-]*\$?))? -- '((?:[^']|'\\'')*)'(?: |$)`)

// run executes the one command the host understands. Anything else is not installed.
func run(host *Server, command string) (string, string, uint32) {
	m := chownCommand.FindStringSubmatch(command)
	if m == nil {
		name, _, _ := strings.Cut(command, " ")
		return "", "sh: 1: " + name + ": not found\n", 127
	}
	p := strings.ReplaceAll(m[3], `'\''`, "'")
	if !host.chown(p, m[1], m[2]) {
		return "", "chown: cannot access '" + p + "': No such file or directory\n", 1
	}
	return "", "", 0
}

func handlers(host *Server) sftp.Handlers {
	h := &fs{host: host}
	return sftp.Handlers{FileGet: h, FilePut: h, FileCmd: h, FileList: h}
}

// fs serves the sftp subsystem from the host's files.
type fs struct{ host *Server }

func (f *fs) Fileread(r *sftp.Request) (io.ReaderAt, error) {
	file, isDir, ok := f.host.stat(r.Filepath)
	if !ok || isDir {
		return nil, errNoSuchFile
	}
	return strings.NewReader(file.Content), nil
}

func (f *fs) Filewrite(r *sftp.Request) (io.WriterAt, error) {
	// The request server keeps an open's attributes but not their flags, so the mode is
	// read from the bytes: permissions are the only attribute exactly four bytes long.
	mode := uint32(0o644)
	if len(r.Attrs) == 4 {
		mode = binary.BigEndian.Uint32(r.Attrs) & 0o7777
	}
	if _, isDir, _ := f.host.stat(r.Filepath); isDir {
		return nil, errFailure
	}
	if _, isDir, _ := f.host.stat(path.Dir(r.Filepath)); !isDir {
		return nil, errNoSuchFile
	}
	return &upload{host: f.host, path: r.Filepath, mode: mode}, nil
}

func (f *fs) Filecmd(r *sftp.Request) error {
	switch r.Method {
	case "Remove":
		if !f.host.remove(r.Filepath) {
			return errNoSuchFile
		}
		return nil
	case "Rename":
		return f.host.rename(r.Filepath, r.Target)
	case "Setstat":
		return nil
	}
	return sftp.ErrSSHFxOpUnsupported
}

func (f *fs) Filelist(r *sftp.Request) (sftp.ListerAt, error) {
	switch r.Method {
	case "List":
		names, ok := f.host.list(r.Filepath)
		if !ok {
			return nil, errNoSuchFile
		}
		out := make(listing, 0, len(names))
		for _, n := range names {
			file, _, _ := f.host.stat(r.Filepath + "/" + n)
			out = append(out, info{name: n, file: file})
		}
		return out, nil
	case "Stat", "Lstat":
		file, isDir, ok := f.host.stat(r.Filepath)
		if !ok {
			return nil, errNoSuchFile
		}
		return listing{info{name: path.Base(r.Filepath), file: file, dir: isDir}}, nil
	}
	return nil, sftp.ErrSSHFxOpUnsupported
}

// handshakeTimeout bounds a connection that never finishes the SSH handshake, and
// maxUpload a single file, so one bad peer cannot hold the shared fakenet's resources.
const (
	handshakeTimeout = 10 * time.Second
	maxUpload        = 1 << 20
)

// upload buffers a file until the client closes it, then stores it whole.
type upload struct {
	host *Server
	path string
	mode uint32

	mu     sync.Mutex
	buf    []byte
	failed bool
}

// WriteAt refuses a write past maxUpload and marks the upload failed, so Close discards
// it rather than storing the part the client was told did not land.
func (u *upload) WriteAt(p []byte, off int64) (int, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	if off < 0 || off > maxUpload || int64(len(p)) > maxUpload-off {
		u.failed = true
		return 0, sftp.ErrSSHFxFailure
	}
	if end := int(off) + len(p); end > len(u.buf) {
		u.buf = append(u.buf, make([]byte, end-len(u.buf))...)
	}
	copy(u.buf[off:], p)
	return len(p), nil
}

// TransferError is called when the connection drops mid-transfer, before the server
// closes the open file, so Close discards the partial upload instead of storing it.
func (u *upload) TransferError(error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.failed = true
}

func (u *upload) Close() error {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.failed {
		return sftp.ErrSSHFxFailure
	}
	if !u.host.put(u.path, bytes.Clone(u.buf), u.mode) {
		return errNoSuchFile
	}
	return nil
}

type info struct {
	name string
	file *File
	dir  bool
}

func (i info) Name() string { return i.name }
func (i info) Size() int64 {
	if i.file == nil {
		return 0
	}
	return int64(len(i.file.Content))
}
func (i info) Mode() os.FileMode {
	if i.dir {
		return os.ModeDir | 0o755
	}
	if i.file == nil {
		return 0
	}
	return os.FileMode(i.file.Mode)
}
func (i info) ModTime() time.Time { return time.Now() }
func (i info) IsDir() bool        { return i.dir }
func (i info) Sys() any           { return nil }

type listing []os.FileInfo

func (l listing) ListAt(out []os.FileInfo, off int64) (int, error) {
	if off >= int64(len(l)) {
		return 0, io.EOF
	}
	n := copy(out, l[off:])
	if off+int64(n) >= int64(len(l)) {
		return n, io.EOF
	}
	return n, nil
}
