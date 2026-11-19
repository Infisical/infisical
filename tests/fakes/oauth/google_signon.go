package oauth

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
)

// Google's federated sign-on certificates (GET /oauth2/v1/certs) verify the ID tokens
// GCE instances present for machine identity GCP auth. The request carries no
// credential, so it cannot be scoped per test: every test signs with this one fixed,
// test-only key, and is kept apart by the token's audience, its own identity id.
const (
	GoogleSignOnKeyID = "harness-google-federated-signon"

	googleSignOnScope = "federated-signon"

	googleSignOnKeyPEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEogIBAAKCAQEAsmIsEL62xNJxVY6ch893QuYsi5LFquiz2y9mQvMdtXfjBAJx
SUvy8/hmXBd6ADbG34NhUc8CP8AkMvAxt/G7Plzs2O7GGYd5Rq+RhNJaqz/ApGA4
qspD1Vzozf+Q5D6KrfnQXCcZka5D5sCxNxoXdGGC9TfZNxtpcOQTZutSdvPdRJb5
MiDnmHmgvZGhlywrSkslshioOQGbJZseZZcRFVgSyubttM3+npmiupO4JRHtEbUu
cEdyB+GE3NUs7V/bbQC//fQnk9rjgHntKQnAq7UILtG6WlXZSImU5ppGZ2vSOnIH
NSq9+GdOwcQ7pvAbuqdhsInyRd4Lz6RMgpYDTwIDAQABAoIBAC0hSj24Slw0U6kO
KgrwEZ+yxR1QtkK9mdc/wDL6+A6ztJMMnSWqmd5gf2EYLW0Fbr4YqpP8d/ix/1aF
z0ZW2YT3FJLzodnOnP+lpn7Ai2DdAbt0fpGzF4NQ/LM1T653JjXKyIyv9beWK6aj
JJKovrtaejvY89MN09jUUxZMPfJK5flm0WhHG1xuEnC8veapLKsEQ2+aubf0BKYc
63CEKakeU8XsQni+A08YJXIxYoSMdoh9ZHEfon749Y9OrMSGolF0caH4ELSqx3v1
uNJIi6YLsmFfUA/DTWm/y7G5OKbrzkO3gIVZA9bJWEr595h55O8ql79Lbp69Y22E
jv0sWxECgYEA9oPyeWKttuI3pdSp/fVcWehAwT1rMMNfzhhBalhEuhVoJyyahPMC
Z3LPwAvEdj836Oswv7BTg4ZUsdaea/O8sooSRJUN385KGN0+5CYcTBb22I+LNix+
W76nvomxG7qFW71jVJnFaaIZdNFls4NO71EhjrYNIFG9FVl9Z6zg+r8CgYEAuT8o
4h0+SJjGw70Php1LYq0t92v5ipgq0fPH72VflaCG6Hj07cVkmykcSYW0JE73W7vM
ZBafhTJz24z4Ex6f/T6SEsh8A1i5CHpnjy70zkj1fCIWHQ4pTaS6kyM8lQ+xTvJf
b8M64epoZCLGufDy0haaTm/hqqoSTslXh3tm63ECgYAgDiRXmHdSUrQ9whugxGkP
392bwyrPGni4yfqno3a8Y9A5V9l39EmZvho5tM4FOk9A4GRkaL9TWQJmZawQCY+9
/6pEdMVrFt4XwZ1N+Y6wbkQHARNvJfYAZBhX9HutSWHR/hyOgbhj9gotYJVC9I4t
HHWqow2t6DMYNZzTAG347QKBgH95UP7YNMXsK8sCTK7LitaqaVk7egq/T6gOY2T/
k1j5kBxlL9Z24RZMoeSOFzptBJahkrLFRpx37XYFeaheiKXR6t72CzCaWynUYXMM
UvWpCxSSuDjiR9XgJ2uc8dF5bP/wlW/pHpnbnl5Z9/p4LgAYAbM8FkREqDiDILJg
XqBhAoGAR9YxWBQjJMJQ3G4J7W1A6zejI5A96SUdbGRlLjgLyU01Bvz2CNjqpPoC
NqMGGIfWgviA08/x35O/UcoeC7En+p/QF5SRsmAfUDPpQtRdrHKAwn9g5zsSC2ka
4afiVsXlhtJ1LbZMM37wYw3vQH0/eAVPaAtxQm8j14XVqo5Akyo=
-----END RSA PRIVATE KEY-----`

	googleSignOnCertPEM = `-----BEGIN CERTIFICATE-----
MIIDNzCCAh+gAwIBAgIUUeyEFknLJ+JCaTKH8jBC+bRirjEwDQYJKoZIhvcNAQEL
BQAwKjEoMCYGA1UEAwwfaGFybmVzcy1nb29nbGUtZmVkZXJhdGVkLXNpZ25vbjAg
Fw0yNjEwMzEyMDU1NTJaGA8yMTI2MTAwNzIwNTU1MlowKjEoMCYGA1UEAwwfaGFy
bmVzcy1nb29nbGUtZmVkZXJhdGVkLXNpZ25vbjCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBALJiLBC+tsTScVWOnIfPd0LmLIuSxaros9svZkLzHbV34wQC
cUlL8vP4ZlwXegA2xt+DYVHPAj/AJDLwMbfxuz5c7NjuxhmHeUavkYTSWqs/wKRg
OKrKQ9Vc6M3/kOQ+iq350FwnGZGuQ+bAsTcaF3RhgvU32TcbaXDkE2brUnbz3USW
+TIg55h5oL2RoZcsK0pLJbIYqDkBmyWbHmWXERVYEsrm7bTN/p6ZorqTuCUR7RG1
LnBHcgfhhNzVLO1f220Av/30J5Pa44B57SkJwKu1CC7RulpV2UiJlOaaRmdr0jpy
BzUqvfhnTsHEO6bwG7qnYbCJ8kXeC8+kTIKWA08CAwEAAaNTMFEwHQYDVR0OBBYE
FDEMoc5BalKRC1EJHXM+UTbU4CSMMB8GA1UdIwQYMBaAFDEMoc5BalKRC1EJHXM+
UTbU4CSMMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAEL2Gw65
w3kR8kiI540EHWAnYMlubtV8Zbp6mOeafzsczuaApc7FwEfETNLvdxhDr3AlUSvx
pJ9FKSnHbsVmvZN8zg6MFE55SkSBCXGcC9ufEnKY9vO4nGOabS1lubTGmaSJzL6J
6PwSnXARqixRjx4OK43Z4Wc3ELutfEVwzSo1lX3Nmf7w7KYCOPZAinXZdYJu462k
vVUVqYC3UE7wgnZyEsKfuulKXsBGb0Pf2KH9afgZydRCr9R70n80v2eV6QI8V1F7
x/rbOWYCPTJFAIeK5b9cdz0sZlpj97YKRS5INHMZh+3qe5HAofnM/YWs8tu4+jyf
2x5YbQXZic2XQD4=
-----END CERTIFICATE-----`
)

// GoogleSignOnKey is the private half of the published federated sign-on certificate.
func GoogleSignOnKey() *rsa.PrivateKey {
	block, _ := pem.Decode([]byte(googleSignOnKeyPEM))
	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		panic(err)
	}
	return key
}
