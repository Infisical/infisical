package acmeca

import (
	"encoding/json"
	"net/http"
)

// problem is an RFC 7807 problem document with an ACME error type.
type problem struct {
	Type   string `json:"type"`
	Detail string `json:"detail"`
	Status int    `json:"status"`
}

func (p *problem) write(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(p.Status)
	_ = json.NewEncoder(w).Encode(problem{Type: "urn:ietf:params:acme:error:" + p.Type, Detail: p.Detail, Status: p.Status})
}

func malformed(detail string) *problem {
	return &problem{Type: "malformed", Detail: detail, Status: http.StatusBadRequest}
}

func notFound(what string) *problem {
	return &problem{Type: "malformed", Detail: "no such " + what + " for this account", Status: http.StatusNotFound}
}
