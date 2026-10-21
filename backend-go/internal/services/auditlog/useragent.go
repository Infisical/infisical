package auditlog

import "strings"

// UserAgentType represents the type of client making the request.
type UserAgentType string

const (
	UserAgentTypeWeb                       UserAgentType = "web"
	UserAgentTypeCLI                       UserAgentType = "cli"
	UserAgentTypeK8Operator                UserAgentType = "k8-operator"
	UserAgentTypeTerraform                 UserAgentType = "terraform"
	UserAgentTypePythonSDK                 UserAgentType = "InfisicalPythonSDK"
	UserAgentTypeNodeSDK                   UserAgentType = "InfisicalNodeSDK"
	UserAgentTypeAgent                     UserAgentType = "infisical-agent"
	UserAgentTypeK8ExternalSecretsOperator UserAgentType = "k8-external-secrets-operator"
	UserAgentTypeGoSDK                     UserAgentType = "infisical-go-sdk"
	UserAgentTypeRubySDK                   UserAgentType = "infisical-ruby-sdk"
	UserAgentTypeDotnetSDK                 UserAgentType = "Infisical.Sdk"
	UserAgentTypeRustSDK                   UserAgentType = "infisical-rs"
	UserAgentTypeCppSDK                    UserAgentType = "infisical-cpp-sdk"
	UserAgentTypeOther                     UserAgentType = "other"
)

// matchesExactOrVersioned reports whether the user agent equals the base value
// or is a versioned form of it, e.g. "infisical-go-sdk/v0.4.0".
func matchesExactOrVersioned(userAgent string, base UserAgentType) bool {
	return userAgent == string(base) || strings.HasPrefix(userAgent, string(base)+"/")
}

// GetUserAgentType classifies a user agent string into a UserAgentType.
// This is an exact port of the Node.js getUserAgentType function.
func GetUserAgentType(userAgent string) string {
	if userAgent == "" {
		return string(UserAgentTypeOther)
	}

	if userAgent == string(UserAgentTypeCLI) {
		return string(UserAgentTypeCLI)
	}

	// also match the versioned UA, e.g. "k8-operator/0.11.4"
	if matchesExactOrVersioned(userAgent, UserAgentTypeK8Operator) {
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

	// clients that send a bare or versioned user agent, e.g. "infisical-go-sdk" or "infisical-agent/1.2.3"
	exactOrVersionedMatches := []UserAgentType{
		UserAgentTypeAgent,
		UserAgentTypeK8ExternalSecretsOperator,
		UserAgentTypeGoSDK,
		UserAgentTypeRubySDK,
		UserAgentTypeDotnetSDK,
		UserAgentTypeRustSDK,
		UserAgentTypeCppSDK,
	}
	for _, match := range exactOrVersionedMatches {
		if matchesExactOrVersioned(userAgent, match) {
			return string(match)
		}
	}

	// current-generation python/node SDK user agents map to the existing SDK channels
	if matchesExactOrVersioned(userAgent, "infisical-python-sdk") {
		return string(UserAgentTypePythonSDK)
	}
	if matchesExactOrVersioned(userAgent, "infisical-nodejs-sdk") {
		return string(UserAgentTypeNodeSDK)
	}

	return string(UserAgentTypeOther)
}
