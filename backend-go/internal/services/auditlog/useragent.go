package auditlog

import "strings"

// GetUserAgentType classifies a user agent string into a UserAgentType.
// This is an exact port of the Node.js getUserAgentType function.
func GetUserAgentType(userAgent string) string {
	if userAgent == "" {
		return string(UserAgentTypeOther)
	}

	if userAgent == string(UserAgentTypeCLI) {
		return string(UserAgentTypeCLI)
	}

	if userAgent == string(UserAgentTypeK8Operator) {
		return string(UserAgentTypeK8Operator)
	}

	if userAgent == string(UserAgentTypeTerraform) {
		return string(UserAgentTypeTerraform)
	}

	if strings.Contains(strings.ToLower(userAgent), "mozilla") {
		return string(UserAgentTypeWeb)
	}

	if strings.Contains(userAgent, string(UserAgentTypeNodeSDK)) {
		return string(UserAgentTypeNodeSDK)
	}

	if strings.Contains(userAgent, string(UserAgentTypePythonSDK)) {
		return string(UserAgentTypePythonSDK)
	}

	return string(UserAgentTypeOther)
}
