package cloudflare

// DNSRecordCreated is published when a record is added to a zone.
type DNSRecordCreated struct {
	Zone string `json:"zone"`
	DNSRecord
}

func (DNSRecordCreated) EventName() string { return "cloudflare.dns-record-created" }

// DNSRecordDeleted is published when a record is removed from a zone.
type DNSRecordDeleted struct {
	Zone string `json:"zone"`
	DNSRecord
}

func (DNSRecordDeleted) EventName() string { return "cloudflare.dns-record-deleted" }
