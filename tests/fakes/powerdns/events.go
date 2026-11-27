package powerdns

// RecordDetail is one record of an RRset and the zone it is in.
type RecordDetail struct {
	Zone    string `json:"zone"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	Content string `json:"content"`
}

// RecordCreated is published for each record a PATCH adds to an RRset.
type RecordCreated struct{ RecordDetail }

// RecordDeleted is published for each record a PATCH removes from an RRset.
type RecordDeleted struct{ RecordDetail }

func (RecordCreated) EventName() string { return "powerdns.record-created" }
func (RecordDeleted) EventName() string { return "powerdns.record-deleted" }
