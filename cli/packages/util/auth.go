package util

type AuthStrategyType string

var AuthStrategy = struct {
	UNIVERSAL_AUTH    AuthStrategyType
	KUBERNETES_AUTH   AuthStrategyType
	AZURE_AUTH        AuthStrategyType
	GCP_ID_TOKEN_AUTH AuthStrategyType
	GCP_IAM_AUTH      AuthStrategyType
	AWS_IAM_AUTH      AuthStrategyType
	OIDC_AUTH         AuthStrategyType
}{
	UNIVERSAL_AUTH:    "universal-auth",
	KUBERNETES_AUTH:   "kubernetes",
	AZURE_AUTH:        "azure",
	GCP_ID_TOKEN_AUTH: "gcp-id-token",
	GCP_IAM_AUTH:      "gcp-iam",
	AWS_IAM_AUTH:      "aws-iam",
	OIDC_AUTH:         "oidc-auth",
}

var AVAILABLE_AUTH_STRATEGIES = []AuthStrategyType{
	AuthStrategy.UNIVERSAL_AUTH,
	AuthStrategy.KUBERNETES_AUTH,
	AuthStrategy.AZURE_AUTH,
	AuthStrategy.GCP_ID_TOKEN_AUTH,
	AuthStrategy.GCP_IAM_AUTH,
	AuthStrategy.AWS_IAM_AUTH,
	AuthStrategy.OIDC_AUTH,
}

func IsAuthMethodValid(authMethod string, allowUserAuth bool) (isValid bool, strategy AuthStrategyType) {

	if authMethod == "user" && allowUserAuth {
		return true, ""
	}

	for _, strategy := range AVAILABLE_AUTH_STRATEGIES {
		if string(strategy) == authMethod {
			return true, strategy
		}
	}
	return false, ""
}
