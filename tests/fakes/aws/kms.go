package aws

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/google/uuid"
)

// KMSAccount is one account's symmetric KMS keys. Encryption is real AES-GCM under each
// key's own material, so a ciphertext only decrypts in the account that holds its key.
type KMSAccount struct {
	Policy
	Keys map[string]*KMSKey `json:"keys"`

	mu     sync.Mutex
	events fakenet.Emitter
	h      handler
}

// KMSKey is a symmetric encryption key. Its material never leaves the fake.
type KMSKey struct {
	KeyID        string    `json:"keyId"`
	CreationDate time.Time `json:"creationDate"`
	material     []byte
}

// A ciphertext blob is the key id, a GCM nonce and the sealed plaintext, the key id
// authenticated as additional data, so the blob names the key that can open it.
const (
	kmsKeyIDLen    = 36
	kmsNonceLen    = 12
	kmsMaxPlaintxt = 4096
)

func newKMS(svc service, events fakenet.Emitter) fakenet.Fake {
	a := &KMSAccount{Keys: map[string]*KMSKey{}, events: events}
	a.h = handler{svc: svc, mu: &a.mu, policy: func() *Policy { return &a.Policy }, actions: map[string]func(call) (any, *apiError){
		"CreateKey":   a.createKey,
		"DescribeKey": a.describeKey,
		"Encrypt":     a.encrypt,
		"Decrypt":     a.decrypt,
	}}
	return a
}

func (a *KMSAccount) ServeHTTP(w http.ResponseWriter, r *http.Request) { a.h.serve(w, r) }

func (a *KMSAccount) Snapshot() ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return json.Marshal(struct {
		Policy
		Keys map[string]*KMSKey `json:"keys"`
	}{a.Policy, a.Keys})
}

// Seed merges keys that exist before Infisical touches the account, each with fresh
// material.
func (a *KMSAccount) Seed(raw []byte) error {
	var in struct {
		Policy
		Keys map[string]*KMSKey `json:"keys"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.merge(in.Policy)
	for id := range in.Keys {
		if len(id) != kmsKeyIDLen || uuid.Validate(id) != nil {
			return fmt.Errorf("KMS key id %q is not a UUID in its 36-character form", id)
		}
		if _, ok := a.Keys[id]; !ok {
			a.Keys[id] = newKMSKey(id)
		}
	}
	return nil
}

func newKMSKey(id string) *KMSKey {
	material := make([]byte, 32)
	_, _ = rand.Read(material)
	return &KMSKey{KeyID: id, CreationDate: now(), material: material}
}

func kmsArn(account, keyID string) string {
	return "arn:aws:kms:" + Region + ":" + account + ":key/" + keyID
}

// key resolves a key id or key ARN in this account. Aliases are not modelled.
func (a *KMSAccount) key(c call, ref string) (*KMSKey, *apiError) {
	if ref == "" {
		return nil, errf(http.StatusBadRequest, "ValidationException", "1 validation error detected: Value null at 'keyId' failed to satisfy constraint: Member must not be null")
	}
	id := ref
	if rest, isArn := strings.CutPrefix(ref, "arn:aws:kms:"+Region+":"+c.account()+":key/"); isArn {
		id = rest
	}
	k, ok := a.Keys[id]
	if !ok {
		return nil, errf(http.StatusBadRequest, "NotFoundException", "Key '%s' does not exist", kmsArn(c.account(), ref))
	}
	return k, nil
}

type kmsKeyMetadata struct {
	AWSAccountID         string   `json:"AWSAccountId"`
	KeyID                string   `json:"KeyId"`
	Arn                  string   `json:"Arn"`
	CreationDate         float64  `json:"CreationDate"`
	Enabled              bool     `json:"Enabled"`
	KeyState             string   `json:"KeyState"`
	KeyUsage             string   `json:"KeyUsage"`
	KeySpec              string   `json:"KeySpec"`
	KeyManager           string   `json:"KeyManager"`
	Origin               string   `json:"Origin"`
	EncryptionAlgorithms []string `json:"EncryptionAlgorithms"`
}

func metadata(c call, k *KMSKey) kmsKeyMetadata {
	return kmsKeyMetadata{
		AWSAccountID: c.account(), KeyID: k.KeyID, Arn: kmsArn(c.account(), k.KeyID), CreationDate: epoch(k.CreationDate),
		Enabled: true, KeyState: "Enabled", KeyUsage: "ENCRYPT_DECRYPT", KeySpec: "SYMMETRIC_DEFAULT",
		KeyManager: "CUSTOMER", Origin: "AWS_KMS", EncryptionAlgorithms: []string{"SYMMETRIC_DEFAULT"},
	}
}

func (a *KMSAccount) createKey(c call) (any, *apiError) {
	var in struct {
		KeySpec  string `json:"KeySpec"`
		KeyUsage string `json:"KeyUsage"`
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	if (in.KeySpec != "" && in.KeySpec != "SYMMETRIC_DEFAULT") || (in.KeyUsage != "" && in.KeyUsage != "ENCRYPT_DECRYPT") {
		return nil, errf(http.StatusBadRequest, "UnsupportedOperationException", "only SYMMETRIC_DEFAULT ENCRYPT_DECRYPT keys are modelled")
	}
	k := newKMSKey(uuid.NewString())
	a.Keys[k.KeyID] = k
	a.events.Publish(KeyCreated{KeyDetail{KeyID: k.KeyID}})
	return map[string]any{"KeyMetadata": metadata(c, k)}, nil
}

func (a *KMSAccount) describeKey(c call) (any, *apiError) {
	var in struct {
		KeyID string `json:"KeyId"`
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	k, err := a.key(c, in.KeyID)
	if err != nil {
		return nil, err
	}
	return map[string]any{"KeyMetadata": metadata(c, k)}, nil
}

func (a *KMSAccount) encrypt(c call) (any, *apiError) {
	var in struct {
		KeyID             string            `json:"KeyId"`
		Plaintext         []byte            `json:"Plaintext"`
		EncryptionContext map[string]string `json:"EncryptionContext"`
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	if err := refuseEncryptionContext(in.EncryptionContext); err != nil {
		return nil, err
	}
	k, err := a.key(c, in.KeyID)
	if err != nil {
		return nil, err
	}
	if len(in.Plaintext) == 0 || len(in.Plaintext) > kmsMaxPlaintxt {
		return nil, errf(http.StatusBadRequest, "ValidationException",
			"1 validation error detected: Value at 'plaintext' failed to satisfy constraint: Member must have length between 1 and %d", kmsMaxPlaintxt)
	}
	gcm := k.gcm()
	nonce := make([]byte, kmsNonceLen)
	_, _ = rand.Read(nonce)
	blob := append([]byte(k.KeyID), nonce...)
	blob = gcm.Seal(blob, nonce, in.Plaintext, []byte(k.KeyID))
	return map[string]any{"CiphertextBlob": blob, "KeyId": kmsArn(c.account(), k.KeyID), "EncryptionAlgorithm": "SYMMETRIC_DEFAULT"}, nil
}

func (a *KMSAccount) decrypt(c call) (any, *apiError) {
	var in struct {
		KeyID             string            `json:"KeyId"`
		CiphertextBlob    []byte            `json:"CiphertextBlob"`
		EncryptionContext map[string]string `json:"EncryptionContext"`
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	if err := refuseEncryptionContext(in.EncryptionContext); err != nil {
		return nil, err
	}
	invalid := errf(http.StatusBadRequest, "InvalidCiphertextException", "")
	if len(in.CiphertextBlob) < kmsKeyIDLen+kmsNonceLen {
		return nil, invalid
	}
	k, ok := a.Keys[string(in.CiphertextBlob[:kmsKeyIDLen])]
	if !ok {
		return nil, invalid
	}
	if in.KeyID != "" {
		named, err := a.key(c, in.KeyID)
		if err != nil {
			return nil, err
		}
		if named != k {
			return nil, errf(http.StatusBadRequest, "IncorrectKeyException",
				"The key ID in the request does not identify a CMK that can perform this operation.")
		}
	}
	nonce := in.CiphertextBlob[kmsKeyIDLen : kmsKeyIDLen+kmsNonceLen]
	plaintext, err := k.gcm().Open(nil, nonce, in.CiphertextBlob[kmsKeyIDLen+kmsNonceLen:], []byte(k.KeyID))
	if err != nil {
		return nil, invalid
	}
	return map[string]any{"Plaintext": plaintext, "KeyId": kmsArn(c.account(), k.KeyID), "EncryptionAlgorithm": "SYMMETRIC_DEFAULT"}, nil
}

// refuseEncryptionContext fails a call that sends an encryption context. AWS binds the
// context to the ciphertext and this fake does not, so accepting one would let a
// decrypt under the wrong context succeed here when it fails on AWS.
func refuseEncryptionContext(ctx map[string]string) *apiError {
	if len(ctx) == 0 {
		return nil
	}
	return errf(http.StatusBadRequest, "UnsupportedOperationException", "EncryptionContext is not modelled")
}

func (k *KMSKey) gcm() cipher.AEAD {
	block, err := aes.NewCipher(k.material)
	if err != nil {
		panic(err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		panic(err)
	}
	return gcm
}
