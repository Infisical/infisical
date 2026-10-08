package fakenet

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

const testHost = "items.test"

type ItemCreated struct {
	Name string `json:"name"`
}
type ItemDeleted struct {
	Name string `json:"name"`
}

func (ItemCreated) EventName() string { return "items.item-created" }
func (ItemDeleted) EventName() string { return "items.item-deleted" }

type itemService struct{}

func (itemService) Host() string { return testHost }
func (itemService) Scope(r *http.Request) (string, bool) {
	return strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
}
func (itemService) New(events Emitter) Fake { return &itemFake{events: events} }

type itemFake struct{ events Emitter }

func (f *itemFake) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/items/")
	switch r.Method {
	case http.MethodPost:
		f.events.Publish(ItemCreated{Name: name})
	case http.MethodDelete:
		f.events.Publish(ItemDeleted{Name: name})
	}
	w.WriteHeader(http.StatusNoContent)
}
func (f *itemFake) Snapshot() ([]byte, error) { return json.Marshal(struct{}{}) }
func (f *itemFake) Seed([]byte) error         { return nil }

type rig struct {
	fakes *httptest.Server
	admin string
}

// newRig serves one fakenet in-process and opens a stream for prefix, as harness.Main
// does for a test binary.
func newRig(t *testing.T, prefix string) *rig {
	t.Helper()
	srv := New(itemService{})
	ca, err := LoadOrCreateCA(filepath.Join(t.TempDir(), "ca.pem"))
	require.NoError(t, err)
	fakes := httptest.NewServer(srv)
	admin := httptest.NewServer(srv.Admin(ca))
	t.Cleanup(fakes.Close)
	t.Cleanup(admin.Close)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	require.NoError(t, Listen(ctx, admin.URL, prefix))
	return &rig{fakes: fakes, admin: admin.URL}
}

func (r *rig) call(t *testing.T, method, key, name string) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, r.fakes.URL+"/items/"+name, nil)
	require.NoError(t, err)
	req.Host = testHost
	req.Header.Set("Authorization", "Bearer "+key)
	res, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	_ = res.Body.Close()
}

func (r *rig) scope(t *testing.T, key string) *Scope[struct{}] {
	t.Helper()
	Track(t, r.admin, testHost, key)
	return Open[struct{}](t, r.admin, testHost, key)
}

func nameIs[E interface{ ItemCreated | ItemDeleted }](want string) func(E) bool {
	return func(e E) bool {
		switch v := any(e).(type) {
		case ItemCreated:
			return v.Name == want
		case ItemDeleted:
			return v.Name == want
		}
		return false
	}
}

func expectErr[E Event](t *testing.T, sc *Scope[struct{}], match func(E) bool, opts ...WaitOption) error {
	t.Helper()
	st, b := sc.buffer(t)
	_, err := expectEvent(st, b, sc.key, newWaitConfig(defaultExpectWithin, opts), match)
	return err
}

func TestEvents_Expect(t *testing.T) {
	t.Run("should find an event that already happened", func(t *testing.T) {
		// Setup
		r := newRig(t, "p1")
		sc := r.scope(t, "p1-a")
		r.call(t, http.MethodPost, "p1-a", "DB_URL")

		// Action
		got := sc.ExpectEvent[ItemCreated](t, nameIs[ItemCreated]("DB_URL"))

		// Assert
		require.Equal(t, "DB_URL", got.Name)
	})

	t.Run("should find an event that arrives while waiting", func(t *testing.T) {
		// Setup
		r := newRig(t, "p2")
		sc := r.scope(t, "p2-a")
		go func() {
			time.Sleep(200 * time.Millisecond)
			req, _ := http.NewRequest(http.MethodPost, r.fakes.URL+"/items/LATE", nil)
			req.Host = testHost
			req.Header.Set("Authorization", "Bearer p2-a")
			if res, err := http.DefaultClient.Do(req); err == nil {
				_ = res.Body.Close()
			}
		}()

		// Action + Assert: ExpectEvent fails the test if the event never arrives.
		sc.ExpectEvent[ItemCreated](t, nameIs[ItemCreated]("LATE"))
	})

	t.Run("should need a second occurrence when the same event is expected twice", func(t *testing.T) {
		// Setup
		r := newRig(t, "p3")
		sc := r.scope(t, "p3-a")
		r.call(t, http.MethodPost, "p3-a", "ONCE")
		sc.ExpectEvent[ItemCreated](t, nameIs[ItemCreated]("ONCE"))

		// Action
		err := expectErr(t, sc, nameIs[ItemCreated]("ONCE"), Within(300*time.Millisecond))

		// Assert
		require.ErrorContains(t, err, "already claimed")
	})

	t.Run("should not depend on order when the events differ in type", func(t *testing.T) {
		// Setup
		r := newRig(t, "p4")
		sc := r.scope(t, "p4-a")
		r.call(t, http.MethodPost, "p4-a", "X")
		r.call(t, http.MethodDelete, "p4-a", "X")

		// Action + Assert
		sc.ExpectEvent[ItemDeleted](t, nil)
		sc.ExpectEvent[ItemCreated](t, nil)
	})

	t.Run("should ignore events before the mark when Since is given", func(t *testing.T) {
		// Setup
		r := newRig(t, "p5")
		sc := r.scope(t, "p5-a")
		r.call(t, http.MethodPost, "p5-a", "X")
		mark := sc.Mark(t)

		// Action
		before := expectErr[ItemCreated](t, sc, nil, Since(mark), Within(300*time.Millisecond))
		r.call(t, http.MethodPost, "p5-a", "X")

		// Assert
		require.Error(t, before, "an event before the mark satisfied an expectation since it")
		sc.ExpectEvent[ItemCreated](t, nil, Since(mark))
	})

	t.Run("should not deliver an event when it belongs to another credential", func(t *testing.T) {
		// Setup
		r := newRig(t, "p6")
		mine, theirs := r.scope(t, "p6-a"), r.scope(t, "p6-b")

		// Action
		r.call(t, http.MethodPost, "p6-b", "THEIRS")

		// Assert
		theirs.ExpectEvent[ItemCreated](t, nil)
		require.Error(t, expectErr[ItemCreated](t, mine, nil, Within(300*time.Millisecond)))
	})

	t.Run("should not stream an event when it is outside this binary's prefix", func(t *testing.T) {
		// Setup
		r := newRig(t, "p7")
		foreign := r.scope(t, "other-a")

		// Action
		r.call(t, http.MethodPost, "other-a", "X")

		// Assert
		require.Error(t, expectErr[ItemCreated](t, foreign, nil, Within(300*time.Millisecond)))
	})
}

func TestEvents_ExpectNo(t *testing.T) {
	expectNoErr := func(t *testing.T, sc *Scope[struct{}]) error {
		st, b := sc.buffer(t)
		return expectNoEvent[ItemCreated](st, b, sc.key, newWaitConfig(300*time.Millisecond, nil), nil)
	}

	t.Run("should pass when nothing is published", func(t *testing.T) {
		// Setup
		r := newRig(t, "n1")

		// Action + Assert
		require.NoError(t, expectNoErr(t, r.scope(t, "n1-a")))
	})

	t.Run("should fail when an unused matching event exists", func(t *testing.T) {
		// Setup
		r := newRig(t, "n2")
		sc := r.scope(t, "n2-a")

		// Action
		r.call(t, http.MethodPost, "n2-a", "X")

		// Assert
		require.Error(t, expectNoErr(t, sc))
	})

	t.Run("should pass when the matching event was already claimed", func(t *testing.T) {
		// Setup
		r := newRig(t, "n3")
		sc := r.scope(t, "n3-a")
		r.call(t, http.MethodPost, "n3-a", "X")

		// Action
		sc.ExpectEvent[ItemCreated](t, nil)

		// Assert
		require.NoError(t, expectNoErr(t, sc))
	})
}

func TestEvents_Failure(t *testing.T) {
	t.Run("should say nothing arrived when the scope is empty", func(t *testing.T) {
		// Setup
		r := newRig(t, "f1")
		sc := r.scope(t, "f1-a")

		// Action
		err := expectErr(t, sc, nameIs[ItemCreated]("RIGHT"), Within(500*time.Millisecond))

		// Assert
		require.ErrorContains(t, err, "no events arrived in this scope")
	})

	t.Run("should list other events when only a different type arrived", func(t *testing.T) {
		// Setup
		r := newRig(t, "f2")
		sc := r.scope(t, "f2-a")
		r.call(t, http.MethodDelete, "f2-a", "X")

		// Action
		err := expectErr(t, sc, nameIs[ItemCreated]("RIGHT"), Within(500*time.Millisecond))

		// Assert
		require.ErrorContains(t, err, "no items.item-created arrived")
	})

	t.Run("should list near misses when the predicate rejected them", func(t *testing.T) {
		// Setup
		r := newRig(t, "f3")
		sc := r.scope(t, "f3-a")
		r.call(t, http.MethodPost, "f3-a", "WRONG")

		// Action
		err := expectErr(t, sc, nameIs[ItemCreated]("RIGHT"), Within(500*time.Millisecond))

		// Assert
		require.ErrorContains(t, err, "none matched")
	})
}

func TestEvents_Loss(t *testing.T) {
	t.Run("should fail rather than drop silently when a buffer overflows", func(t *testing.T) {
		// Setup
		st := &stream{buffers: map[scopeID]*buffer{}}
		b := &buffer{changed: make(chan struct{})}
		st.buffers[scopeID{testHost, "k"}] = b

		// Action
		for i := range bufferCap + 1 {
			st.deliver(EventRecord{Seq: uint64(i + 1), Host: testHost, Scope: "k", Event: "items.item-created", Details: []byte(`{}`)})
		}

		// Assert
		_, err := expectEvent[ItemDeleted](st, b, "k", waitConfig{within: time.Second}, nil)
		require.ErrorContains(t, err, "were not kept")
	})

	t.Run("should report a gap when resuming past retained history", func(t *testing.T) {
		// Setup
		l := newEventLog()

		// Action
		for range historyCap + 10 {
			l.append(EventRecord{Scope: "k"})
		}

		// Assert
		_, early, _ := l.since(1)
		_, latest, _ := l.since(l.current())
		require.True(t, early, "resuming from before retained history did not report a gap")
		require.False(t, latest, "resuming from the latest event reported a gap")
	})
}
