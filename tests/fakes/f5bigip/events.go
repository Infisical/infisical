package f5bigip

// FileUploaded is a file fully assembled under the downloads directory.
type FileUploaded struct {
	Name string `json:"name"`
}

// FileObjectDetail names an ssl-cert or ssl-key object by its full path.
type FileObjectDetail struct {
	Kind string `json:"kind"`
	Path string `json:"path"`
}

// FileObjectInstalled is an ssl-cert or ssl-key object created or updated from a file.
type FileObjectInstalled FileObjectDetail
type FileObjectDeleted FileObjectDetail

// ClientSSLProfileUpdated is a Client SSL profile's cert-key-chain replaced.
type ClientSSLProfileUpdated struct {
	Path         string              `json:"path"`
	CertKeyChain []CertKeyChainEntry `json:"certKeyChain"`
}

// ConfigSaved is the running configuration saved, with the objects it held.
type ConfigSaved struct {
	Objects []string `json:"objects"`
}

func (FileUploaded) EventName() string        { return "f5bigip.file-uploaded" }
func (FileObjectInstalled) EventName() string { return "f5bigip.file-object-installed" }
func (FileObjectDeleted) EventName() string   { return "f5bigip.file-object-deleted" }
func (ConfigSaved) EventName() string         { return "f5bigip.config-saved" }
func (ClientSSLProfileUpdated) EventName() string {
	return "f5bigip.client-ssl-profile-updated"
}
