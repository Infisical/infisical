package aws

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
)

type credential struct {
	accessKeyID   string
	date          string
	region        string
	service       string
	signedHeaders []string
	signature     string
}

// parseAuthorization reads
// "AWS4-HMAC-SHA256 Credential=AKID/20240101/us-east-1/ssm/aws4_request, SignedHeaders=host;x-amz-date, Signature=hex".
func parseAuthorization(header string) (credential, bool) {
	rest, ok := strings.CutPrefix(header, "AWS4-HMAC-SHA256 ")
	if !ok {
		return credential{}, false
	}
	var c credential
	for part := range strings.SplitSeq(rest, ",") {
		k, v, found := strings.Cut(strings.TrimSpace(part), "=")
		if !found {
			return credential{}, false
		}
		switch k {
		case "Credential":
			scope := strings.Split(v, "/")
			if len(scope) != 5 || scope[4] != "aws4_request" {
				return credential{}, false
			}
			c.accessKeyID, c.date, c.region, c.service = scope[0], scope[1], scope[2], scope[3]
		case "SignedHeaders":
			c.signedHeaders = strings.Split(v, ";")
		case "Signature":
			c.signature = v
		}
	}
	return c, c.accessKeyID != "" && c.signature != "" && len(c.signedHeaders) > 0
}

// signature is SigV4 over the request as it arrived, and the canonical request it
// signed, which AWS quotes back when the two disagree.
func signature(r *http.Request, body []byte, c credential, secret string) (sig, canonical string) {
	payloadHash := r.Header.Get("X-Amz-Content-Sha256")
	if payloadHash == "" {
		sum := sha256.Sum256(body)
		payloadHash = hex.EncodeToString(sum[:])
	}

	var headers strings.Builder
	for _, name := range c.signedHeaders {
		headers.WriteString(name + ":" + headerValue(r, name) + "\n")
	}

	canonical = strings.Join([]string{
		r.Method,
		canonicalURI(r.URL.EscapedPath()),
		canonicalQuery(r.URL.Query()),
		headers.String(),
		strings.Join(c.signedHeaders, ";"),
		payloadHash,
	}, "\n")

	scope := c.date + "/" + c.region + "/" + c.service + "/aws4_request"
	sum := sha256.Sum256([]byte(canonical))
	toSign := strings.Join([]string{"AWS4-HMAC-SHA256", r.Header.Get("X-Amz-Date"), scope, hex.EncodeToString(sum[:])}, "\n")

	key := hmacSHA256([]byte("AWS4"+secret), c.date)
	key = hmacSHA256(key, c.region)
	key = hmacSHA256(key, c.service)
	key = hmacSHA256(key, "aws4_request")
	return hex.EncodeToString(hmacSHA256(key, toSign)), canonical
}

func headerValue(r *http.Request, name string) string {
	if strings.EqualFold(name, "host") {
		return r.Host
	}
	values := r.Header.Values(name)
	if len(values) == 0 && strings.EqualFold(name, "content-length") && r.ContentLength >= 0 {
		values = []string{strconv.FormatInt(r.ContentLength, 10)}
	}
	trimmed := make([]string, len(values))
	for i, v := range values {
		trimmed[i] = strings.Join(strings.Fields(v), " ")
	}
	return strings.Join(trimmed, ",")
}

func canonicalURI(p string) string {
	if p == "" {
		return "/"
	}
	return p
}

func canonicalQuery(q url.Values) string {
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var parts []string
	for _, k := range keys {
		vs := append([]string(nil), q[k]...)
		sort.Strings(vs)
		for _, v := range vs {
			parts = append(parts, uriEncode(k)+"="+uriEncode(v))
		}
	}
	return strings.Join(parts, "&")
}

// uriEncode is RFC 3986 encoding with only the unreserved characters left alone.
func uriEncode(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if ('A' <= ch && ch <= 'Z') || ('a' <= ch && ch <= 'z') || ('0' <= ch && ch <= '9') ||
			ch == '-' || ch == '_' || ch == '.' || ch == '~' {
			b.WriteByte(ch)
			continue
		}
		b.WriteString("%" + strings.ToUpper(hex.EncodeToString([]byte{ch})))
	}
	return b.String()
}

func hmacSHA256(key []byte, data string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(data))
	return m.Sum(nil)
}
