package oauth

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
)

// The service account the instance itself authenticates as before it impersonates the
// account a GCP App Connection names (INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL).
// One fixed, test-only key for the whole stack, like the federated sign-on key: the
// token request it signs carries no per-test credential. Tests are kept apart by the
// account they impersonate.
const (
	GCPInstanceServiceAccountEmail = "infisical-harness@harness-instance.iam.gserviceaccount.com"

	gcpInstanceScope = "gcp-instance-service-account"

	gcpInstanceKeyPEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAv/LjRvwZQYdeogAtV90yhC+Xn4LDLBLlAkhQ9xxa5JMi+L5k
3hX96w0lQq0zQKUMgxsg4KEsxt98x996qlouggdt/Lb0gB9AkmMMHkx3sjs64ZIN
YXtYbrP5Je+CCkffB+mjbb8Ai8M/98dSC14g5DQaF1ev7WocuGC2zC7gf8vnrigO
MkgzEJIs4NOC0IEDj4YxYdCiNvFvLTI6JDsMpndR4fQAQf0Km7OMLpoRPGqlbzYY
7Ff2AC5Hi4Bd4Q1YeszrrICANVp/mUTx8H4tFmrNRyjkB4nh1gygurCKQ6enDyLS
pJBmRb7g+fwRp/wYbaCCitSAwkpxxZjVxUcPOQIDAQABAoIBACO2W8FU/Zjyx/FR
oZ4PlkrANRBVKp1cXZXNYRz8vk95LaBEgi1Mv6uYDEbpxRehraCF71nDuvo8UfG4
+1BPC4ifO8AxRO/CgMfLnFFVzk5PlU6rFwi8Q3GDVBdSBqqFgTIubrzoNMCMIO5n
e/UH/AwhQnp10tJT9Ah82/3EufmkokPgNi8n9pYPsLf07d2X/lmLMRLAZDuLiCCm
xnAVIABygdXbQrMLXUMN+/KdUiUNnBg3LgpnTmrA1YtUtPzqjS10L8iZ4VeWGVyi
1+UZwSci7bbKWPGa84TS6sFxDRvs+jH6fsfsi8RsHdCvMHLp27Ux03IoNEvuA8gB
qVrdVmUCgYEA8kyy78iCyAe1h8hlGG4eiZFieoaBjg3gnxSOcM6XuZ719V/DCyiz
U5aK/V+zARmh2juJ/kBxU7jHSomjlGG72ueiCK13Qc1i+Ke5RxcqnzSYT+tB9aY0
QIlV/huiFLFNvo8agfiaA+Hlg/uwhHTUEuikYO9uwBlcgZY10/yuzK0CgYEAys1b
kPyj4N6qi1+J/cPaSs4guFKBOI6VIFtteaZv0OeXpwCiCVj3EkBYE0J/JEiPVlSS
P5mvfmQ+lP5UeWMxw8hkrSMvuq1zqu9WNn/1Az4Ren5pY/xm9CrSvwUzyacdGSb4
1LkOfPMcx3g0K6trx/XawEy9r9GjTQ/xPfSQsj0CgYEA6/G4RTsR70tigCiqGVIS
No/2P63/Np9Y3lAcLMlgggbDJ//qZFFr3re3/OdV3nphW6uiwo1qTcafenvxaKqL
Ta1F4gFZIiCogc6B4zIx9Po4X4qNnnIMa9PQgzPRbykAtdGQVIQLJkCxSQasay+A
3DDi8On3BOUtaZsmK5nhdbkCgYBmR0NSz9dmZWXlfH1/efLxnxtpWlLJTz9uXi3M
GGB0HxigpPUTecbBcan5rKOqjN2dUHGhmcSkHbJiOhIoVhqW/s2ndANyRl/7aVE1
kzriM79k47QLNRRHOAGpTNpdbOaD9N+xiNMBuSpefwTwsTdeVWPJb+qKbVPKXavw
7xK6kQKBgQC/IEkYLz7JgIb8LUku/ucivYm/Fep9Vi90OgU4R7/0yVKIKH7eby5H
/8DpAxH4nKKr1qpOiKIdyhja2VKiSKkziMPb/NEDwKg/UjbPuLF5INmGkcL1GrUP
wtyRfjL8trKvL9d29rXXeStajXKmkFhh9+19dUdp8RuU/PR5wXYQVA==
-----END RSA PRIVATE KEY-----`
)

// GCPInstanceCredential is the service account key JSON the instance boots with.
func GCPInstanceCredential() string {
	raw, err := json.Marshal(map[string]string{
		"type":           "service_account",
		"project_id":     "harness-instance",
		"private_key_id": "harness-instance-key",
		"private_key":    gcpInstanceKeyPEM + "\n",
		"client_email":   GCPInstanceServiceAccountEmail,
		"token_uri":      "https://oauth2.googleapis.com/token",
	})
	if err != nil {
		panic(err)
	}
	return string(raw)
}

func gcpInstancePublicKey() *rsa.PublicKey {
	block, _ := pem.Decode([]byte(gcpInstanceKeyPEM))
	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		panic(err)
	}
	return &key.PublicKey
}
