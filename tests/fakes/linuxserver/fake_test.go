package linuxserver

import (
	"io"
	"net"
	"os"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/pkg/sftp"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/ssh"
)

func newHost(t *testing.T, user string) (*Server, string) {
	t.Helper()
	host := Service.New(fakenet.New(Service).Emitter(Service.Host(), user)).(*Server)
	require.NoError(t, host.Seed([]byte(`{"directories":["/etc/ssl/app"]}`)))
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		_ = ServeListener(ln, func(u string) (*Server, bool) { return host, u == user })
	}()
	return host, ln.Addr().String()
}

func dial(t *testing.T, addr, user, password string) (*ssh.Client, error) {
	t.Helper()
	return ssh.Dial("tcp", addr, &ssh.ClientConfig{
		User:            user,
		Auth:            []ssh.AuthMethod{ssh.Password(password)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	})
}

func TestFake_Login(t *testing.T) {
	_, addr := newHost(t, "deploy")

	_, err := dial(t, addr, "deploy", "wrong")
	require.Error(t, err)

	_, err = dial(t, addr, "someone", Password("someone"))
	require.Error(t, err, "a username without a host is refused")

	c, err := dial(t, addr, "deploy", Password("deploy"))
	require.NoError(t, err)
	_ = c.Close()
}

func TestFake_SFTPWriteRenameRemove(t *testing.T) {
	host, addr := newHost(t, "deploy")
	c, err := dial(t, addr, "deploy", Password("deploy"))
	require.NoError(t, err)
	defer func() { _ = c.Close() }()
	s, err := sftp.NewClient(c)
	require.NoError(t, err)
	defer func() { _ = s.Close() }()

	f, err := s.OpenFile("/etc/ssl/app/tls.key.tmp", os.O_WRONLY|os.O_CREATE|os.O_TRUNC)
	require.NoError(t, err)
	_, err = f.Write([]byte("secret"))
	require.NoError(t, err)
	require.NoError(t, f.Close())

	require.NoError(t, s.Rename("/etc/ssl/app/tls.key.tmp", "/etc/ssl/app/tls.key"))
	require.Equal(t, "secret", host.Files["/etc/ssl/app/tls.key"].Content)
	require.Equal(t, "deploy", host.Files["/etc/ssl/app/tls.key"].Owner)

	entries, err := s.ReadDir("/etc/ssl/app")
	require.NoError(t, err)
	require.Len(t, entries, 1)
	require.Equal(t, "tls.key", entries[0].Name())

	_, err = s.Create("/missing/dir/file")
	require.ErrorIs(t, err, os.ErrNotExist)

	require.NoError(t, s.Remove("/etc/ssl/app/tls.key"))
	require.Empty(t, host.Files)
}

func TestFake_OpenModeFromAttributes(t *testing.T) {
	f := &fs{host: Service.New(fakenet.Emitter{}).(*Server)}
	require.NoError(t, f.host.Seed([]byte(`{"directories":["/srv"]}`)))
	w, err := f.Filewrite(&sftp.Request{Filepath: "/srv/a.key", Attrs: []byte{0, 0, 0x01, 0x80}})
	require.NoError(t, err)
	_, err = w.WriteAt([]byte("k"), 0)
	require.NoError(t, err)
	require.NoError(t, w.(io.Closer).Close())
	require.Equal(t, uint32(0o600), f.host.Files["/srv/a.key"].Mode)
}

func TestFake_OversizedWriteStoresNothing(t *testing.T) {
	f := &fs{host: Service.New(fakenet.Emitter{}).(*Server)}
	require.NoError(t, f.host.Seed([]byte(`{"directories":["/srv"]}`)))
	f.host.put("/srv/existing", []byte("original"), 0o644)

	for _, p := range []string{"/srv/existing", "/srv/new"} {
		w, err := f.Filewrite(&sftp.Request{Filepath: p})
		require.NoError(t, err)
		_, err = w.WriteAt([]byte("prefix"), 0)
		require.NoError(t, err)
		_, err = w.WriteAt([]byte("x"), maxUpload)
		require.Error(t, err)
		require.Error(t, w.(io.Closer).Close())
	}
	require.Equal(t, "original", f.host.Files["/srv/existing"].Content)
	require.NotContains(t, f.host.Files, "/srv/new")
}

func TestFake_DroppedUploadStoresNothing(t *testing.T) {
	host := Service.New(fakenet.Emitter{}).(*Server)
	require.NoError(t, host.Seed([]byte(`{"directories":["/srv"]}`)))
	host.put("/srv/existing", []byte("original"), 0o644)

	for _, p := range []string{"/srv/existing", "/srv/new"} {
		serverEnd, clientEnd := net.Pipe()
		deadline := time.Now().Add(5 * time.Second)
		require.NoError(t, serverEnd.SetDeadline(deadline))
		require.NoError(t, clientEnd.SetDeadline(deadline))
		srv := sftp.NewRequestServer(serverEnd, handlers(host))
		t.Cleanup(func() { _ = srv.Close() })
		served := make(chan struct{})
		go func() {
			_ = srv.Serve()
			close(served)
		}()
		c, err := sftp.NewClientPipe(clientEnd, clientEnd)
		require.NoError(t, err)
		t.Cleanup(func() { _ = c.Close() })
		f, err := c.OpenFile(p, os.O_WRONLY|os.O_CREATE|os.O_TRUNC)
		require.NoError(t, err)
		_, err = f.Write([]byte("partial"))
		require.NoError(t, err)

		require.NoError(t, clientEnd.Close())
		select {
		case <-served:
		case <-time.After(5 * time.Second):
			t.Fatalf("the server kept serving %s after the client dropped the connection", p)
		}
	}
	require.Equal(t, "original", host.Files["/srv/existing"].Content)
	require.NotContains(t, host.Files, "/srv/new")
}

func TestFake_WriteKeepsOpenMode(t *testing.T) {
	host := Service.New(fakenet.Emitter{}).(*Server)
	require.NoError(t, host.Seed([]byte(`{"directories":["/srv"]}`)))
	require.True(t, host.put("/srv/a.pem", []byte("x"), 0o640))
	require.Equal(t, uint32(0o640), host.Files["/srv/a.pem"].Mode)
	require.False(t, host.put("/nowhere/a.pem", []byte("x"), 0o640))
}

func TestFake_RenameRefusesToOverwrite(t *testing.T) {
	host := Service.New(fakenet.Emitter{}).(*Server)
	require.NoError(t, host.Seed([]byte(`{"directories":["/srv"]}`)))
	host.put("/srv/a", []byte("a"), 0o644)
	host.put("/srv/b", []byte("b"), 0o644)
	require.Error(t, host.rename("/srv/a", "/srv/b"))
}

func TestFake_Chown(t *testing.T) {
	host, addr := newHost(t, "deploy")
	host.put("/etc/ssl/app/it's.pem", []byte("x"), 0o644)
	c, err := dial(t, addr, "deploy", Password("deploy"))
	require.NoError(t, err)
	defer func() { _ = c.Close() }()

	run := func(cmd string) error {
		sess, err := c.NewSession()
		require.NoError(t, err)
		defer func() { _ = sess.Close() }()
		return sess.Run(cmd)
	}

	require.NoError(t, run(`chown www-data:ssl-cert -- '/etc/ssl/app/it'\''s.pem' 2>/dev/null || sudo -n chown www-data:ssl-cert -- '/etc/ssl/app/it'\''s.pem'`))
	require.Equal(t, "www-data", host.Files["/etc/ssl/app/it's.pem"].Owner)
	require.Equal(t, "ssl-cert", host.Files["/etc/ssl/app/it's.pem"].Group)

	var exit *ssh.ExitError
	require.ErrorAs(t, run(`chown root -- '/etc/ssl/app/missing'`), &exit)
	require.Equal(t, 1, exit.ExitStatus())
	require.ErrorAs(t, run(`systemctl reload nginx`), &exit)
	require.Equal(t, 127, exit.ExitStatus())
}

func TestFake_MissingDirectoryReportsNoSuchFile(t *testing.T) {
	// Setup
	f := &fs{host: Service.New(fakenet.Emitter{}).(*Server)}

	// Action
	_, err := f.Filewrite(&sftp.Request{Filepath: "/etc/ssl/missing/a.pem.tmp"})

	// Assert
	require.EqualError(t, err, "no such file")
}
