package auditlog

import "testing"

// Keep this table in sync with the Node mirror in
// backend/src/server/plugins/audit-log.test.ts so drift between the two
// classifiers shows up as a failing test on either side.
func TestGetUserAgentType(t *testing.T) {
	cases := []struct {
		userAgent string
		expected  UserAgentType
	}{
		{"", UserAgentTypeOther},
		{"cli", UserAgentTypeCLI},
		{"k8-operator", UserAgentTypeK8Operator},
		{"k8-operator/0.11.4", UserAgentTypeK8Operator},
		{"terraform", UserAgentTypeTerraform},
		{"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", UserAgentTypeWeb},
		{"InfisicalNodeSDK/2.3.4", UserAgentTypeNodeSDK},
		{"InfisicalPythonSDK/1.8.0", UserAgentTypePythonSDK},
		{"infisical-agent", UserAgentTypeAgent},
		{"infisical-agent/1.2.3", UserAgentTypeAgent},
		{"k8-external-secrets-operator", UserAgentTypeK8ExternalSecretsOperator},
		{"k8-external-secrets-operator/0.9.5", UserAgentTypeK8ExternalSecretsOperator},
		{"infisical-go-sdk", UserAgentTypeGoSDK},
		{"infisical-go-sdk/v0.4.0", UserAgentTypeGoSDK},
		{"infisical-ruby-sdk", UserAgentTypeRubySDK},
		{"infisical-ruby-sdk/v1.0.3", UserAgentTypeRubySDK},
		{"Infisical.Sdk", UserAgentTypeDotnetSDK},
		{"Infisical.Sdk/2.3.6", UserAgentTypeDotnetSDK},
		{"infisical-rs", UserAgentTypeRustSDK},
		{"infisical-rs/0.1.0", UserAgentTypeRustSDK},
		{"infisical-cpp-sdk", UserAgentTypeCppSDK},
		{"infisical-cpp-sdk/1.0.0", UserAgentTypeCppSDK},
		{"infisical-python-sdk", UserAgentTypePythonSDK},
		{"infisical-python-sdk/2.0.1", UserAgentTypePythonSDK},
		{"infisical-nodejs-sdk", UserAgentTypeNodeSDK},
		{"infisical-nodejs-sdk/3.0.0", UserAgentTypeNodeSDK},
		{"curl/8.4.0", UserAgentTypeOther},
		{"python-requests/2.31.0", UserAgentTypeOther},
		{"infisical-agentx", UserAgentTypeOther},
	}

	for _, tc := range cases {
		if got := GetUserAgentType(tc.userAgent); got != string(tc.expected) {
			t.Errorf("GetUserAgentType(%q) = %q, want %q", tc.userAgent, got, tc.expected)
		}
	}
}
