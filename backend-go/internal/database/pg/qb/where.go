package qb

import "strings"

type Where struct {
	clauses []string
	isOr    bool
}

func NewWhere() *Where {
	return &Where{isOr: false}
}

func newOrWhere() *Where {
	return &Where{isOr: true}
}

func (w *Where) Add(clause string) *Where {
	w.clauses = append(w.clauses, clause)
	return w
}

func (w *Where) AddIf(condition bool, clause string) *Where {
	if condition {
		w.clauses = append(w.clauses, clause)
	}
	return w
}

func (w *Where) Or(clause string) *Where {
	w.clauses = append(w.clauses, clause)
	w.isOr = true
	return w
}

func (w *Where) Group(sub *Where) *Where {
	if !sub.IsEmpty() {
		w.clauses = append(w.clauses, "("+sub.String()+")")
	}
	return w
}

func (w *Where) OrGroup(buildFn func(w *Where)) *Where {
	sub := newOrWhere()
	buildFn(sub)
	return w.Group(sub)
}

func (w *Where) AndGroup(buildFn func(w *Where)) *Where {
	sub := NewWhere()
	buildFn(sub)
	return w.Group(sub)
}

func (w *Where) String() string {
	if w.isOr {
		return strings.Join(w.clauses, " OR ")
	}
	return strings.Join(w.clauses, " AND ")
}

func (w *Where) IsEmpty() bool {
	return len(w.clauses) == 0
}
