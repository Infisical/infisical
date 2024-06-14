package util

type AuthStrategyType string

var AuthStrategy = struct {
	UNIVERSAL_AUTH  AuthStrategyType
	KUBERNETES_AUTH AuthStrategyType
}{
	UNIVERSAL_AUTH:  "universal-auth",
	KUBERNETES_AUTH: "kubernetes",
}

var AVAILABLE_AUTH_STRATEGIES = []AuthStrategyType{
	AuthStrategy.UNIVERSAL_AUTH,
	AuthStrategy.KUBERNETES_AUTH,
}

func IsAuthMethodValid(authMethod string) (isValid bool, strategy AuthStrategyType) {

	if authMethod == "user" {
		return true, ""
	}

	for _, strategy := range AVAILABLE_AUTH_STRATEGIES {
		if string(strategy) == authMethod {
			return true, strategy
		}
	}
	return false, ""
}
