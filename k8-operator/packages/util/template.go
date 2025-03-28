package util

import (
	"encoding/base64"
	"fmt"
	"text/template"
)

var InfisicalSecretTemplateFunctions = template.FuncMap{
	"decodeBase64ToBytes": func(encodedString string) string {
		decoded, err := base64.StdEncoding.DecodeString(encodedString)
		if err != nil {
			panic(fmt.Sprintf("Error: %v", err))
		}
		return string(decoded)
	},
	"encodeBase64": func(plainString string) string {
		return base64.StdEncoding.EncodeToString([]byte(plainString))
	},
}
