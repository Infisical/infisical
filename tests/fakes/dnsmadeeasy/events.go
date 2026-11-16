package dnsmadeeasy

// RecordCreated is published when a record is added to a managed zone.
type RecordCreated struct {
	Zone string `json:"zone"`
	Record
}

func (RecordCreated) EventName() string { return "dnsmadeeasy.record-created" }

// RecordDeleted is published when a record is removed from a managed zone.
type RecordDeleted struct {
	Zone string `json:"zone"`
	Record
}

func (RecordDeleted) EventName() string { return "dnsmadeeasy.record-deleted" }
