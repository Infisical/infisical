package fn

// RemoveTrailingSlash removes the trailing slash from a string.
// If the string is just "/", it returns "/" unchanged.
func RemoveTrailingSlash(str string) string {
	if str == "/" {
		return str
	}
	if str != "" && str[len(str)-1] == '/' {
		return str[:len(str)-1]
	}
	return str
}
