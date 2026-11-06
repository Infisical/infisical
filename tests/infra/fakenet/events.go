package fakenet

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Event is something a fake did that a test may wait for. The type names itself, so
// a detail can never be published under the wrong name.
type Event interface{ EventName() string }

// EventRecord is one published event as it travels to a test.
type EventRecord struct {
	Seq     uint64          `json:"seq"`
	Host    string          `json:"host"`
	Scope   string          `json:"scope"`
	Event   string          `json:"event"`
	At      time.Time       `json:"at"`
	Details json.RawMessage `json:"eventDetails"`
}

// Emitter publishes events for one scope, so a fake cannot attribute an event to
// another caller.
type Emitter struct {
	log  *eventLog
	host string
	key  string
}

func (e Emitter) Publish(ev Event) {
	if e.log == nil {
		return
	}
	details, err := json.Marshal(ev)
	if err != nil {
		log.Printf("fakenet: dropping %s, its details do not marshal: %v", ev.EventName(), err)
		return
	}
	e.log.append(EventRecord{
		Host:    e.host,
		Scope:   e.key,
		Event:   ev.EventName(),
		At:      time.Now().UTC(),
		Details: details,
	})
}

// historyCap bounds memory while leaving room to resume a dropped stream.
const historyCap = 50_000

type eventLog struct {
	mu      sync.Mutex
	records []EventRecord
	lastSeq uint64
	changed chan struct{}
}

func newEventLog() *eventLog { return &eventLog{changed: make(chan struct{})} }

func (l *eventLog) append(rec EventRecord) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.lastSeq++
	rec.Seq = l.lastSeq
	l.records = append(l.records, rec)
	if len(l.records) > historyCap {
		l.records = l.records[len(l.records)-historyCap:]
	}
	close(l.changed)
	l.changed = make(chan struct{})
}

// since returns records after seq, whether history no longer reaches back that far,
// and a channel closed on the next append.
func (l *eventLog) since(seq uint64) (out []EventRecord, gap bool, changed <-chan struct{}) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.records) > 0 && l.records[0].Seq > seq+1 {
		gap = true
	}
	for _, r := range l.records {
		if r.Seq > seq {
			out = append(out, r)
		}
	}
	return out, gap, l.changed
}

func (l *eventLog) current() uint64 {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.lastSeq
}

// serveEvents streams events as SSE: history first, then live.
//
// One stream per test binary, filtered by credential prefix, so a binary never
// receives the traffic of packages running beside it.
func (s *Server) serveEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	prefix := r.URL.Query().Get("prefix")

	var after uint64
	resuming := false
	if v := r.Header.Get("Last-Event-ID"); v != "" {
		after, _ = strconv.ParseUint(v, 10, 64)
		resuming = true
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	for {
		records, gap, changed := s.events.since(after)
		if gap && resuming {
			// Resume reached past retained history, so events were lost. Saying so
			// lets the client fail the affected expectations instead of hanging.
			_, _ = fmt.Fprint(w, "event: gap\ndata: {}\n\n")
		}
		resuming = false
		for _, rec := range records {
			after = rec.Seq
			if !strings.HasPrefix(rec.Scope, prefix) {
				continue
			}
			body, _ := json.Marshal(rec)
			_, _ = fmt.Fprintf(w, "id: %d\ndata: %s\n\n", rec.Seq, body)
		}
		flusher.Flush()

		select {
		case <-r.Context().Done():
			return
		case <-changed:
		}
	}
}
