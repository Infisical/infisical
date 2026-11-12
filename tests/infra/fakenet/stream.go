package fakenet

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// bufferCap bounds one credential's events. Overflow fails the test rather than
// losing events silently.
const bufferCap = 5_000

type buffer struct {
	records  []EventRecord
	used     []bool
	overflow bool
	changed  chan struct{}
}

type stream struct {
	adminURL   string
	prefix     string
	wholeHosts []string

	mu      sync.Mutex
	buffers map[scopeID]*buffer
	lastSeq uint64
	gap     bool
}

var (
	streamsMu sync.Mutex
	streams   = map[string]*stream{}
)

// Listen opens this binary's event stream and keeps it open, resuming after a drop.
//
// prefix filters to this binary's credentials. wholeHosts are scoped by product ids
// instead, so they come through unfiltered and only tracked scopes are kept. Returns
// once the first connection is up, so an unreachable fakenet fails in TestMain rather
// than as a timeout in some test.
func Listen(ctx context.Context, adminURL, prefix string, wholeHosts ...string) error {
	adminURL = strings.TrimSuffix(adminURL, "/")
	st := &stream{adminURL: adminURL, prefix: prefix, wholeHosts: wholeHosts, buffers: map[scopeID]*buffer{}}

	streamsMu.Lock()
	streams[adminURL] = st
	streamsMu.Unlock()

	connected := make(chan error, 1)
	go st.run(ctx, connected)

	select {
	case err := <-connected:
		return err
	case <-time.After(10 * time.Second):
		return fmt.Errorf("fakenet: event stream at %s did not connect within 10s", adminURL)
	}
}

// Track starts collecting events for one credential and stops when the test ends.
//
// Called by whatever mints the credential, before handing it to Infisical. Nothing
// can publish under a credential Infisical has not received, so no event for it can
// arrive before its buffer exists.
func Track(tt *testing.T, adminURL, host, key string) {
	tt.Helper()
	st := streamFor(tt, adminURL)
	id := scopeID{host, key}

	st.mu.Lock()
	if _, ok := st.buffers[id]; ok {
		// Already tracked by this test, such as a plan set at tenant creation and a
		// handle opened later; replacing the buffer would drop what arrived between.
		st.mu.Unlock()
		return
	}
	st.buffers[id] = &buffer{changed: make(chan struct{})}
	st.mu.Unlock()

	tt.Cleanup(func() {
		st.mu.Lock()
		delete(st.buffers, id)
		st.mu.Unlock()
	})
}

func streamFor(tt *testing.T, adminURL string) *stream {
	tt.Helper()
	streamsMu.Lock()
	st := streams[strings.TrimSuffix(adminURL, "/")]
	streamsMu.Unlock()
	if st == nil {
		tt.Fatalf("fakenet: no event stream for %s. harness.Main opens one; a test outside the harness must call fakenet.Listen", adminURL)
	}
	return st
}

func (st *stream) run(ctx context.Context, connected chan<- error) {
	first := true
	for ctx.Err() == nil {
		err := st.consume(ctx, func() {
			if first {
				first = false
				connected <- nil
			}
		})
		if first {
			first = false
			connected <- err
			return
		}
		select {
		case <-ctx.Done():
		case <-time.After(200 * time.Millisecond):
		}
	}
}

func (st *stream) consume(ctx context.Context, onOpen func()) error {
	query := url.Values{"prefix": {st.prefix}}
	for _, h := range st.wholeHosts {
		query.Add("host", h)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		st.adminURL+AdminPrefix+"/events?"+query.Encode(), nil)
	if err != nil {
		return err
	}
	st.mu.Lock()
	if st.lastSeq > 0 {
		req.Header.Set("Last-Event-ID", strconv.FormatUint(st.lastSeq, 10))
	}
	st.mu.Unlock()

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("fakenet: opening the event stream: %w", err)
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("fakenet: event stream returned %d", res.StatusCode)
	}
	onOpen()

	scanner := bufio.NewScanner(res.Body)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	gapNext := false
	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case line == "event: gap":
			gapNext = true
		case strings.HasPrefix(line, "data: "):
			if gapNext {
				gapNext = false
				st.markGap()
				continue
			}
			var rec EventRecord
			if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &rec) == nil {
				st.deliver(rec)
			}
		}
	}
	return scanner.Err()
}

func (st *stream) deliver(rec EventRecord) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.lastSeq = rec.Seq

	b, ok := st.buffers[scopeID{rec.Host, rec.Scope}]
	if !ok {
		return
	}
	if len(b.records) >= bufferCap {
		b.overflow = true
	} else {
		b.records = append(b.records, rec)
		b.used = append(b.used, false)
	}
	close(b.changed)
	b.changed = make(chan struct{})
}

func (st *stream) markGap() {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.gap = true
	for _, b := range st.buffers {
		close(b.changed)
		b.changed = make(chan struct{})
	}
}
