// Package smtp is the mail server Infisical sends to, run inside fakenet.
//
// smtpmock speaks the protocol and keeps raw transcripts; this package parses each one
// and publishes it as a MessageReceived event, scoped to the recipient's domain. Each
// tenant mails within its own domain, so tenants never see each other's mail.
package smtp

import (
	"log"
	"strings"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	smtpmock "github.com/mocktools/go-smtp-mock/v2"
)

// Port is where Infisical delivers.
const Port = 25

// Host is the event host every mail event is published under.
const Host = "smtp"

// Message is a delivered mail, parsed.
type Message struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`

	// Body is the plain text and HTML parts joined. Callers search it for a link or a
	// code rather than caring which part carried it.
	Body string `json:"body"`

	// ParseError is set when the transcript could not be read as MIME. The message is
	// still published, so a test fails on the content rather than on a missing mail.
	ParseError string `json:"parseError,omitempty"`
}

// MessageReceived is published once per recipient, so a message to two addresses
// satisfies an expectation for each.
type MessageReceived struct {
	Recipient string  `json:"recipient"`
	Message   Message `json:"message"`
}

func (MessageReceived) EventName() string { return "smtp.message-received" }

// EmitterFor returns the emitter for one recipient domain.
type EmitterFor func(domain string) fakenet.Emitter

type Server struct {
	mock    *smtpmock.Server
	emitter EmitterFor
}

func New(emitter EmitterFor) *Server { return newServer(Port, emitter) }

func newServer(port int, emitter EmitterFor) *Server {
	return &Server{
		mock: smtpmock.New(smtpmock.ConfigurationAttr{
			HostAddress: "0.0.0.0",
			PortNumber:  port,
			// nodemailer reuses a connection for several messages and sends one
			// message to several recipients.
			MultipleRcptto:           true,
			MultipleMessageReceiving: true,
		}),
		emitter: emitter,
	}
}

// Start listens and publishes each message as it completes.
func (s *Server) Start() error {
	if err := s.mock.Start(); err != nil {
		return err
	}
	go s.publishLoop()
	return nil
}

func (s *Server) Stop() error { return s.mock.Stop() }

// publishLoop polls because smtpmock has no delivery hook. MessagesAndPurge rather
// than WaitForMessagesAndPurge: the latter copies and clears under separate locks, so
// a message landing in between is lost.
func (s *Server) publishLoop() {
	for range time.Tick(20 * time.Millisecond) {
		for _, raw := range s.mock.MessagesAndPurge() {
			if !raw.IsConsistent() {
				log.Printf("smtp: dropping an incomplete transaction from %s", raw.MailfromRequest())
				continue
			}
			m := parse(raw)
			for _, rcpt := range m.To {
				_, domain, ok := strings.Cut(rcpt, "@")
				if !ok {
					continue
				}
				s.emitter(domain).Publish(MessageReceived{Recipient: rcpt, Message: m})
			}
		}
	}
}
