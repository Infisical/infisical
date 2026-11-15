package servicenow

// AccessRequestDetail identifies a record of the Infisical Approvals application.
type AccessRequestDetail struct {
	SysID     string `json:"sysId"`
	RequestID string `json:"requestId"`
}

type AccessRequestCreated struct{ AccessRequestDetail }

// AccessRequestRead is Infisical reading a record back to learn its decision.
type AccessRequestRead struct{ AccessRequestDetail }

func (AccessRequestCreated) EventName() string { return "servicenow.access-request-created" }
func (AccessRequestRead) EventName() string    { return "servicenow.access-request-read" }
