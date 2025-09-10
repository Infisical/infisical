package template

import (
	tpl "text/template"

	"github.com/Masterminds/sprig/v3"
)

var customInfisicalSecretTemplateFunctions = tpl.FuncMap{
	"pkcs12key":      pkcs12key,
	"pkcs12keyPass":  pkcs12keyPass,
	"pkcs12cert":     pkcs12cert,
	"pkcs12certPass": pkcs12certPass,

	"pemToPkcs12":         pemToPkcs12,
	"pemToPkcs12Pass":     pemToPkcs12Pass,
	"fullPemToPkcs12":     fullPemToPkcs12,
	"fullPemToPkcs12Pass": fullPemToPkcs12Pass,

	"filterPEM":       filterPEM,
	"filterCertChain": filterCertChain,

	"jwkPublicKeyPem":  jwkPublicKeyPem,
	"jwkPrivateKeyPem": jwkPrivateKeyPem,

	"toYaml":   toYAML,
	"fromYaml": fromYAML,

	"decodeBase64ToBytes": decodeBase64ToBytes,
	"encodeBase64":        encodeBase64,
}

const (
	errParse                = "unable to parse template at key %s: %s"
	errExecute              = "unable to execute template at key %s: %s"
	errDecodePKCS12WithPass = "unable to decode pkcs12 with password: %s"
	errDecodeCertWithPass   = "unable to decode pkcs12 certificate with password: %s"
	errParsePrivKey         = "unable to parse private key type"
	errUnmarshalJSON        = "unable to unmarshal json: %s"
	errMarshalJSON          = "unable to marshal json: %s"

	pemTypeCertificate = "CERTIFICATE"
	pemTypeKey         = "PRIVATE KEY"
)

func InitializeTemplateFunctions() {
	templates := customInfisicalSecretTemplateFunctions

	sprigFuncs := sprig.TxtFuncMap()
	// removed for security reasons
	delete(sprigFuncs, "env")
	delete(sprigFuncs, "expandenv")

	for k, v := range sprigFuncs {
		// make sure we aren't overwriting any of our own functions
		_, exists := templates[k]
		if !exists {
			templates[k] = v
		}
	}

	customInfisicalSecretTemplateFunctions = templates
}

func GetTemplateFunctions() tpl.FuncMap {
	return customInfisicalSecretTemplateFunctions
}
