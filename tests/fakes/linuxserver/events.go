package linuxserver

// FileWritten is a file stored, new or truncated, with the mode it was opened with.
type FileWritten struct {
	Path string `json:"path"`
	Mode uint32 `json:"mode"`
}

type FileRemoved struct {
	Path string `json:"path"`
}

type FileRenamed struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// FileChowned is a file given an owner or group by a chown command.
type FileChowned struct {
	Path  string `json:"path"`
	Owner string `json:"owner"`
	Group string `json:"group"`
}

func (FileWritten) EventName() string { return "linuxserver.file-written" }
func (FileRemoved) EventName() string { return "linuxserver.file-removed" }
func (FileRenamed) EventName() string { return "linuxserver.file-renamed" }
func (FileChowned) EventName() string { return "linuxserver.file-chowned" }
