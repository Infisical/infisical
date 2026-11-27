package ultradns

// RecordDetail names an RRset and its rdata after the change.
type RecordDetail struct {
	Zone  string   `json:"zone"`
	Owner string   `json:"owner"`
	Type  string   `json:"type"`
	RData []string `json:"rdata,omitempty"`
}

// RecordCreated is published when an RRset is created.
type RecordCreated struct{ RecordDetail }

// RecordUpdated is published when an RRset's rdata is replaced.
type RecordUpdated struct{ RecordDetail }

// RecordDeleted is published when an RRset is deleted.
type RecordDeleted struct{ RecordDetail }

func (RecordCreated) EventName() string { return "ultradns.record-created" }
func (RecordUpdated) EventName() string { return "ultradns.record-updated" }
func (RecordDeleted) EventName() string { return "ultradns.record-deleted" }
