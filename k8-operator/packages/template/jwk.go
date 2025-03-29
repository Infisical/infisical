package template

import (
	"crypto/x509"
	"fmt"

	"github.com/lestrrat-go/jwx/v2/jwk"
)

func jwkPublicKeyPem(jwkjson string) string {
	k, err := jwk.ParseKey([]byte(jwkjson))
	if err != nil {
		panic(fmt.Sprintf("[jwkPublicKeyPem] Error: %v", err))
	}
	var rawkey any
	err = k.Raw(&rawkey)
	if err != nil {
		panic(fmt.Sprintf("[jwkPublicKeyPem] Error: %v", err))
	}
	mpk, err := x509.MarshalPKIXPublicKey(rawkey)
	if err != nil {
		panic(fmt.Sprintf("[jwkPublicKeyPem] Error: %v", err))
	}
	return pemEncode(mpk, "PUBLIC KEY")
}

func jwkPrivateKeyPem(jwkjson string) string {
	k, err := jwk.ParseKey([]byte(jwkjson))
	if err != nil {
		panic(fmt.Sprintf("[jwkPrivateKeyPem] Error: %v", err))
	}
	var mpk []byte
	var pk any
	err = k.Raw(&pk)
	if err != nil {
		panic(fmt.Sprintf("[jwkPrivateKeyPem] Error: %v", err))
	}
	mpk, err = x509.MarshalPKCS8PrivateKey(pk)
	if err != nil {
		panic(fmt.Sprintf("[jwkPrivateKeyPem] Error: %v", err))
	}
	return pemEncode(mpk, "PRIVATE KEY")
}
