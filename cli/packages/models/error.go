package models

import log "github.com/sirupsen/logrus"

// Custom error type so that we can give helpful messages in CLI
type Error struct {
	Err             error
	DebugMessage    string
	FriendlyMessage string
}

func (e *Error) printFriendlyMessage() {
	log.Infoln(e.FriendlyMessage)
}
