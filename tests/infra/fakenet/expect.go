package fakenet

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"
)

const (
	defaultExpectWithin   = 10 * time.Second
	defaultExpectNoWithin = 3 * time.Second
	failureListCap        = 20
)

// Mark is a point in the event stream. Events at or before it are ignored by an
// expectation that passes Since(mark).
type Mark struct{ seq uint64 }

// WaitOption adjusts an expectation.
type WaitOption func(*waitConfig)

type waitConfig struct {
	within time.Duration
	since  uint64
}

// Within bounds how long an expectation waits.
func Within(d time.Duration) WaitOption { return func(c *waitConfig) { c.within = d } }

// Since ignores events at or before the mark, for when order matters.
func Since(m Mark) WaitOption { return func(c *waitConfig) { c.since = m.seq } }

// Mark records the current point in the stream.
//
// Read from the server rather than from what this process has received, so a mark
// taken while events are still in flight is not behind them.
func (s *Events) Mark(tt *testing.T) Mark {
	tt.Helper()
	res, err := s.http.Get(s.base + AdminPrefix + "/events/seq")
	if err != nil {
		tt.Fatalf("fakenet: reading the event sequence: %v", err)
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		tt.Fatalf("fakenet: reading the event sequence returned %d", res.StatusCode)
	}
	var out struct {
		Seq uint64 `json:"seq"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		tt.Fatalf("fakenet: reading the event sequence: %v", err)
	}
	return Mark{seq: out.Seq}
}

// ExpectEvent waits for an unused event of type E that match accepts, marks it used,
// and returns it. A nil match accepts any.
//
// Each event satisfies at most one expectation, so expecting the same thing twice
// needs two occurrences. Events that already happened count, which is what lets this
// follow a call that blocks until the product is done.
func (s *Events) ExpectEvent[E Event](tt *testing.T, match func(E) bool, opts ...WaitOption) E {
	tt.Helper()
	st, b := s.buffer(tt)
	e, err := expectEvent(st, b, s.key, newWaitConfig(defaultExpectWithin, opts), match)
	if err != nil {
		tt.Fatal(err)
	}
	return e
}

// ExpectNoEvent fails if an unused event of type E that match accepts exists or
// arrives within the window. A nil match accepts any.
//
// Events already claimed by an ExpectEvent are accounted for and do not fail it.
func (s *Events) ExpectNoEvent[E Event](tt *testing.T, match func(E) bool, opts ...WaitOption) {
	tt.Helper()
	st, b := s.buffer(tt)
	if err := expectNoEvent(st, b, s.key, newWaitConfig(defaultExpectNoWithin, opts), match); err != nil {
		tt.Fatal(err)
	}
}

func newWaitConfig(within time.Duration, opts []WaitOption) waitConfig {
	cfg := waitConfig{within: within}
	for _, o := range opts {
		o(&cfg)
	}
	return cfg
}

func (s *Events) buffer(tt *testing.T) (*stream, *buffer) {
	tt.Helper()
	st := streamFor(tt, s.base)
	st.mu.Lock()
	b := st.buffers[scopeID{s.host, s.key}]
	st.mu.Unlock()
	if b == nil {
		tt.Fatalf("fakenet: no events are tracked for scope %s on %s.\n"+
			"Whatever minted the credential must call fakenet.Track before handing it to Infisical",
			short(s.key), s.host)
	}
	return st, b
}

func expectEvent[E Event](st *stream, b *buffer, key string, cfg waitConfig, match func(E) bool) (E, error) {
	var zero E
	name := zero.EventName()
	deadline := time.After(cfg.within)

	for {
		st.mu.Lock()
		if err := lossLocked(st, b, key); err != nil {
			st.mu.Unlock()
			return zero, err
		}
		if i, e, ok := findLocked(b, cfg, name, match); ok {
			b.used[i] = true
			st.mu.Unlock()
			return e, nil
		}
		changed := b.changed
		st.mu.Unlock()

		select {
		case <-changed:
		case <-deadline:
			st.mu.Lock()
			defer st.mu.Unlock()
			return zero, errors.New(describeMiss(name, cfg, b, key))
		}
	}
}

func expectNoEvent[E Event](st *stream, b *buffer, key string, cfg waitConfig, match func(E) bool) error {
	var zero E
	name := zero.EventName()
	deadline := time.After(cfg.within)

	for {
		st.mu.Lock()
		if err := lossLocked(st, b, key); err != nil {
			st.mu.Unlock()
			return err
		}
		if i, _, ok := findLocked(b, cfg, name, match); ok {
			rec := b.records[i]
			st.mu.Unlock()
			return fmt.Errorf("fakenet: %s matched within %s, expected none (scope %s)\n    #%d  %s",
				name, cfg.within, short(key), rec.Seq, rec.Details)
		}
		changed := b.changed
		st.mu.Unlock()

		select {
		case <-changed:
		case <-deadline:
			return nil
		}
	}
}

// findLocked returns the earliest unused event of the named type after the mark that
// match accepts. Called with the stream lock held.
func findLocked[E Event](b *buffer, cfg waitConfig, name string, match func(E) bool) (int, E, bool) {
	var zero E
	for i, rec := range b.records {
		if rec.Seq <= cfg.since || b.used[i] || rec.Event != name {
			continue
		}
		var e E
		if json.Unmarshal(rec.Details, &e) != nil {
			continue
		}
		if match == nil || match(e) {
			return i, e, true
		}
	}
	return 0, zero, false
}

func lossLocked(st *stream, b *buffer, key string) error {
	switch {
	case st.gap:
		return errors.New("fakenet: the event stream reconnected past retained history, so events were lost")
	case b.overflow:
		return fmt.Errorf("fakenet: more than %d events for scope %s, the rest were not kept", bufferCap, short(key))
	}
	return nil
}

// describeMiss separates the three reasons an expectation fails: nothing arrived,
// something else arrived, or this event arrived but the predicate rejected it. The
// predicate is a func and cannot be printed, so near misses stand in for it.
func describeMiss(name string, cfg waitConfig, b *buffer, key string) string {
	var same, other []EventRecord
	claimed := 0
	for i, rec := range b.records {
		if rec.Seq <= cfg.since {
			continue
		}
		switch {
		case rec.Event != name:
			other = append(other, rec)
		case b.used[i]:
			claimed++
		default:
			same = append(same, rec)
		}
	}

	var out strings.Builder
	fmt.Fprintf(&out, "fakenet: waited %s for %s (scope %s)\n", cfg.within, name, short(key))
	switch {
	case claimed > 0 && len(same) == 0:
		fmt.Fprintf(&out, "\n  %s arrived %d times, all already claimed by an earlier ExpectEvent;"+
			" each event satisfies one expectation, so this one needs a further occurrence\n", name, claimed)
	case len(same) == 0 && len(other) == 0:
		out.WriteString("\n  no events arrived in this scope, so the product never reached the fake under this credential\n")
	case len(same) > 0:
		fmt.Fprintf(&out, "\n  %s arrived %d times, none matched:\n", name, len(same))
		writeRecords(&out, same, false)
	default:
		fmt.Fprintf(&out, "\n  no %s arrived\n", name)
	}
	if len(other) > 0 {
		out.WriteString("\n  other events in this scope:\n")
		writeRecords(&out, other, true)
	}
	return out.String()
}

func writeRecords(out *strings.Builder, recs []EventRecord, withName bool) {
	if len(recs) > failureListCap {
		fmt.Fprintf(out, "    (%d earlier omitted)\n", len(recs)-failureListCap)
		recs = recs[len(recs)-failureListCap:]
	}
	for _, r := range recs {
		if withName {
			fmt.Fprintf(out, "    #%d  %s  %s\n", r.Seq, r.Event, r.Details)
		} else {
			fmt.Fprintf(out, "    #%d  %s\n", r.Seq, r.Details)
		}
	}
}
