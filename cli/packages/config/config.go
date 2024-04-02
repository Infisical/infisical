package config

import "github.com/spf13/viper"

var INFISICAL_URL string
var INFISICAL_URL_MANUAL_OVERRIDE string
var INFISICAL_LOGIN_URL string
var INFISICAL_DISABLE_TELEMETRY bool

func init() {
	// define default and bind the INFISICAL_DISABLE_TELEMETRY envar to the config var
	viper.SetDefault("INFISICAL_DISABLE_TELEMETRY", false)
	viper.BindEnv("INFISICAL_DISABLE_TELEMETRY")
	INFISICAL_DISABLE_TELEMETRY = viper.GetBool("INFISICAL_DISABLE_TELEMETRY")
}

// TODO: automatically generate the below block with a template using go:generate annotation
func GetConfig() map[string]interface{} {
	return map[string]interface{}{
		"INFISICAL_URL":                 INFISICAL_URL,
		"INFISICAL_URL_MANUAL_OVERRIDE": INFISICAL_URL_MANUAL_OVERRIDE,
		"INFISICAL_LOGIN_URL":           INFISICAL_LOGIN_URL,
		"INFISICAL_DISABLE_TELEMETRY":   INFISICAL_DISABLE_TELEMETRY,
	}
}
