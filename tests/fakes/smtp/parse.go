package smtp

import (
	"bytes"
	"encoding/base64"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"strings"

	smtpmock "github.com/mocktools/go-smtp-mock/v2"
)

func parse(raw smtpmock.Message) Message {
	m := Message{From: envelopeAddr(raw.MailfromRequest())}
	for _, pair := range raw.RcpttoRequestResponse() {
		if len(pair) == 2 && strings.HasPrefix(pair[1], "250") {
			m.To = append(m.To, strings.ToLower(envelopeAddr(pair[0])))
		}
	}

	msg, err := mail.ReadMessage(strings.NewReader(raw.MsgRequest()))
	if err != nil {
		m.ParseError = err.Error()
		m.Body = raw.MsgRequest()
		return m
	}

	dec := new(mime.WordDecoder)
	if subject, dErr := dec.DecodeHeader(msg.Header.Get("Subject")); dErr == nil {
		m.Subject = subject
	} else {
		m.Subject = msg.Header.Get("Subject")
	}

	var parts []string
	if err := collectText(msg.Header.Get("Content-Type"), msg.Header.Get("Content-Transfer-Encoding"), msg.Body, &parts); err != nil {
		m.ParseError = err.Error()
	}
	m.Body = strings.Join(parts, "\n")
	return m
}

// envelopeAddr pulls the address out of "MAIL FROM:<a@b>" or "RCPT TO:<a@b>".
func envelopeAddr(cmd string) string {
	start, end := strings.IndexByte(cmd, '<'), strings.LastIndexByte(cmd, '>')
	if start < 0 || end <= start {
		return ""
	}
	return cmd[start+1 : end]
}

func collectText(contentType, encoding string, body io.Reader, into *[]string) error {
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		mediaType = "text/plain"
	}

	if strings.HasPrefix(mediaType, "multipart/") {
		mr := multipart.NewReader(body, params["boundary"])
		for {
			part, pErr := mr.NextRawPart()
			if pErr == io.EOF {
				return nil
			}
			if pErr != nil {
				return pErr
			}
			if cErr := collectText(part.Header.Get("Content-Type"), part.Header.Get("Content-Transfer-Encoding"), part, into); cErr != nil {
				return cErr
			}
		}
	}

	if !strings.HasPrefix(mediaType, "text/") {
		return nil
	}
	decoded, err := io.ReadAll(decode(encoding, body))
	if err != nil {
		return err
	}
	*into = append(*into, string(decoded))
	return nil
}

func decode(encoding string, body io.Reader) io.Reader {
	switch strings.ToLower(strings.TrimSpace(encoding)) {
	case "quoted-printable":
		return quotedprintable.NewReader(body)
	case "base64":
		raw, _ := io.ReadAll(body)
		return base64.NewDecoder(base64.StdEncoding, bytes.NewReader(stripWhitespace(raw)))
	default:
		return body
	}
}

func stripWhitespace(b []byte) []byte {
	return bytes.Map(func(r rune) rune {
		if r == '\r' || r == '\n' || r == ' ' || r == '\t' {
			return -1
		}
		return r
	}, b)
}
