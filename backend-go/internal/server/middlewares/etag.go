package middlewares

import (
	"bytes"
	"crypto/sha1"
	"encoding/base64"
	"net/http"
	"strings"
)

// ETag returns middleware that automatically generates ETags for responses
// and returns 304 Not Modified when If-None-Match matches.
// Equivalent to @fastify/etag in the Node.js backend.
//
// The middleware:
//   - Computes SHA-1 hash of response body for GET/HEAD requests with 2xx status
//   - Sets ETag header as quoted base64-encoded hash (e.g., "abc123...")
//   - Returns 304 Not Modified if If-None-Match header matches the ETag
//   - Skips ETag generation if one is already set by the handler
//   - Only processes string/buffer responses (JSON, text, etc.)
func ETag(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			next.ServeHTTP(w, r)
			return
		}

		ifNoneMatch := r.Header.Get("If-None-Match")

		rw := &etagResponseWriter{
			ResponseWriter: w,
			buf:            &bytes.Buffer{},
			ifNoneMatch:    ifNoneMatch,
		}

		next.ServeHTTP(rw, r)

		rw.finalize()
	})
}

type etagResponseWriter struct {
	http.ResponseWriter
	buf         *bytes.Buffer
	ifNoneMatch string
	statusCode  int
	wroteHeader bool
	finalized   bool
}

func (rw *etagResponseWriter) WriteHeader(statusCode int) {
	rw.statusCode = statusCode
	rw.wroteHeader = true
}

func (rw *etagResponseWriter) Write(b []byte) (int, error) {
	if !rw.wroteHeader {
		rw.statusCode = http.StatusOK
		rw.wroteHeader = true
	}
	return rw.buf.Write(b)
}

func (rw *etagResponseWriter) finalize() {
	if rw.finalized {
		return
	}
	rw.finalized = true

	body := rw.buf.Bytes()

	existingEtag := rw.Header().Get("ETag")
	etag := existingEtag

	if existingEtag == "" && len(body) > 0 && rw.statusCode >= 200 && rw.statusCode < 300 {
		etag = generateETag(body)
		rw.Header().Set("ETag", etag)
	}

	if etag != "" && rw.ifNoneMatch != "" && etagMatches(etag, rw.ifNoneMatch) {
		rw.Header().Del("Content-Length")
		rw.Header().Del("Content-Type")
		rw.ResponseWriter.WriteHeader(http.StatusNotModified)
		return
	}

	if rw.statusCode != 0 {
		rw.ResponseWriter.WriteHeader(rw.statusCode)
	}
	if len(body) > 0 {
		_, _ = rw.ResponseWriter.Write(body)
	}
}

func generateETag(payload []byte) string {
	hash := sha1.Sum(payload)
	return `"` + base64.StdEncoding.EncodeToString(hash[:]) + `"`
}

func etagMatches(etag, ifNoneMatch string) bool {
	etag = strings.TrimSpace(etag)
	ifNoneMatch = strings.TrimSpace(ifNoneMatch)

	if etag == ifNoneMatch {
		return true
	}

	weakEtag := "W/" + etag
	if weakEtag == ifNoneMatch {
		return true
	}

	if strings.HasPrefix(ifNoneMatch, "W/") && ifNoneMatch[2:] == etag {
		return true
	}

	return false
}
