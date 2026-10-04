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
	if err != nil {
		t.Fatal(err)
	}
	fakes := httptest.NewServer(srv)
	admin := httptest.NewServer(srv.Admin(ca))
	t.Cleanup(fakes.Close)
	t.Cleanup(admin.Close)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	if err := Listen(ctx, admin.URL, prefix); err != nil {
		t.Fatal(err)
	}
	return &rig{fakes: fakes, admin: admin.URL}
}

func (r *rig) call(t *testing.T, method, key, name string) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, r.fakes.URL+"/items/"+name, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Host = testHost
	req.Header.Set("Authorization", "Bearer "+key)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
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
	t.Run("ok/an event that already happened is found", func(t *testing.T) {
		r := newRig(t, "p1")
		sc := r.scope(t, "p1-a")
		r.call(t, http.MethodPost, "p1-a", "DB_URL")

		got := sc.ExpectEvent[ItemCreated](t, nameIs[ItemCreated]("DB_URL"))
		if got.Name != "DB_URL" {
			t.Errorf("got %q", got.Name)
		}
	})

	t.Run("ok/an event that arrives while waiting is found", func(t *testing.T) {
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
		sc.ExpectEvent[ItemCreated](t, nameIs[ItemCreated]("LATE"))
	})

	t.Run("invalid/each event satisfies one expectation", func(t *testing.T) {
		r := newRig(t, "p3")
		sc := r.scope(t, "p3-a")
		r.call(t, http.MethodPost, "p3-a", "ONCE")

		sc.ExpectEvent[ItemCreated](t, nameIs[ItemCreated]("ONCE"))
		err := expectErr(t, sc, nameIs[ItemCreated]("ONCE"), Within(300*time.Millisecond))
		if err == nil || !strings.Contains(err.Error(), "already claimed") {
			t.Fatalf("a second expectation reused the event or misreported it: %v", err)
		}
	})

	t.Run("ok/different types do not depend on order", func(t *testing.T) {
		r := newRig(t, "p4")
		sc := r.scope(t, "p4-a")
		r.call(t, http.MethodPost, "p4-a", "X")
		r.call(t, http.MethodDelete, "p4-a", "X")

		sc.ExpectEvent[ItemDeleted](t, nil)
		sc.ExpectEvent[ItemCreated](t, nil)
	})

	t.Run("invalid/since ignores what happened before the mark", func(t *testing.T) {
		r := newRig(t, "p5")
		sc := r.scope(t, "p5-a")
		r.call(t, http.MethodPost, "p5-a", "X")
		mark := sc.Mark(t)

		if err := expectErr[ItemCreated](t, sc, nil, Since(mark), Within(300*time.Millisecond)); err == nil {
			t.Fatal("an event before the mark satisfied an expectation since it")
		}
		r.call(t, http.MethodPost, "p5-a", "X")
		sc.ExpectEvent[ItemCreated](t, nil, Since(mark))
	})

	t.Run("cross-tenant/one credential never sees another's events", func(t *testing.T) {
		r := newRig(t, "p6")
		mine, theirs := r.scope(t, "p6-a"), r.scope(t, "p6-b")
		r.call(t, http.MethodPost, "p6-b", "THEIRS")

		theirs.ExpectEvent[ItemCreated](t, nil)
		if err := expectErr[ItemCreated](t, mine, nil, Within(300*time.Millisecond)); err == nil {
			t.Fatal("an event published under another credential was delivered to this one")
		}
	})

	t.Run("ok/the stream only carries this binary's prefix", func(t *testing.T) {
		r := newRig(t, "p7")
		foreign := r.scope(t, "other-a")
		r.call(t, http.MethodPost, "other-a", "X")

		if err := expectErr[ItemCreated](t, foreign, nil, Within(300*time.Millisecond)); err == nil {
			t.Fatal("an event outside this binary's prefix reached it")
		}
	})
}

func TestEvents_ExpectNo(t *testing.T) {
	expectNoErr := func(t *testing.T, sc *Scope[struct{}]) error {
		st, b := sc.buffer(t)
		return expectNoEvent[ItemCreated](st, b, sc.key, newWaitConfig(300*time.Millisecond, nil), nil)
	}

	t.Run("ok/nothing published passes", func(t *testing.T) {
		r := newRig(t, "n1")
		if err := expectNoErr(t, r.scope(t, "n1-a")); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("invalid/an unused matching event fails", func(t *testing.T) {
		r := newRig(t, "n2")
		sc := r.scope(t, "n2-a")
		r.call(t, http.MethodPost, "n2-a", "X")
		if err := expectNoErr(t, sc); err == nil {
			t.Fatal("ExpectNoEvent passed with a matching event present")
		}
	})

	t.Run("ok/an event already claimed is accounted for", func(t *testing.T) {
		r := newRig(t, "n3")
		sc := r.scope(t, "n3-a")
		r.call(t, http.MethodPost, "n3-a", "X")
		sc.ExpectEvent[ItemCreated](t, nil)
		if err := expectNoErr(t, sc); err != nil {
			t.Fatalf("a claimed event failed ExpectNoEvent: %v", err)
		}
	})
}

func TestEvents_Failure(t *testing.T) {
	cases := []struct {
		name string
		do   func(r *rig, t *testing.T)
		want string
	}{
		{"nothing arrived", func(*rig, *testing.T) {}, "no events arrived in this scope"},
		{"something else arrived", func(r *rig, t *testing.T) { r.call(t, http.MethodDelete, "f-a", "X") }, "no items.item-created arrived"},
		{"rejected by the predicate", func(r *rig, t *testing.T) { r.call(t, http.MethodPost, "f-a", "WRONG") }, "none matched"},
	}
	for _, tc := range cases {
		t.Run("invalid/"+tc.name+" is reported as such", func(t *testing.T) {
			r := newRig(t, "f")
			sc := r.scope(t, "f-a")
			tc.do(r, t)

			err := expectErr(t, sc, nameIs[ItemCreated]("RIGHT"), Within(500*time.Millisecond))
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("message does not say %q:\n%v", tc.want, err)
			}
		})
	}
}

func TestEvents_Loss(t *testing.T) {
	t.Run("invalid/overflow fails rather than dropping silently", func(t *testing.T) {
		st := &stream{buffers: map[scopeID]*buffer{}}
		b := &buffer{changed: make(chan struct{})}
		st.buffers[scopeID{testHost, "k"}] = b
		for i := range bufferCap + 1 {
			st.deliver(EventRecord{Seq: uint64(i + 1), Host: testHost, Scope: "k", Event: "items.item-created", Details: []byte(`{}`)})
		}
		_, err := expectEvent[ItemDeleted](st, b, "k", waitConfig{within: time.Second}, nil)
		if err == nil || !strings.Contains(err.Error(), "were not kept") {
			t.Fatalf("overflow was not reported: %v", err)
		}
	})

	t.Run("invalid/resuming past retained history is a gap", func(t *testing.T) {
		l := newEventLog()
		for range historyCap + 10 {
			l.append(EventRecord{Scope: "k"})
		}
		if _, gap, _ := l.since(1); !gap {
			t.Fatal("resuming from before retained history did not report a gap")
		}
		if _, gap, _ := l.since(l.current()); gap {
			t.Fatal("resuming from the latest event reported a gap")
		}
	})
}
