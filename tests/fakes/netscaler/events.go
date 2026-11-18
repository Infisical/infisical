package netscaler

// FileUploaded is a file written under its full path, such as /nsconfig/ssl/x.cer.
type FileUploaded struct {
	Path string `json:"path"`
}

// CertKeyDetail names a certkey.
type CertKeyDetail struct {
	Name string `json:"name"`
}

type CertKeyCreated CertKeyDetail
type CertKeyUpdated CertKeyDetail
type CertKeyDeleted CertKeyDetail

// ConfigSaved is the running configuration saved, with the certkeys it held.
type ConfigSaved struct {
	CertKeys []string `json:"certKeys"`
}

func (FileUploaded) EventName() string   { return "netscaler.file-uploaded" }
func (CertKeyCreated) EventName() string { return "netscaler.certkey-created" }
func (CertKeyUpdated) EventName() string { return "netscaler.certkey-updated" }
func (CertKeyDeleted) EventName() string { return "netscaler.certkey-deleted" }
func (ConfigSaved) EventName() string    { return "netscaler.config-saved" }
