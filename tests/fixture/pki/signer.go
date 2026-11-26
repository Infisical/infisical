package pki

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Signer is a code signing signer.
type Signer struct {
	ID      uuid.UUID
	Project *Project
}

type signerConfig struct {
	ca      *CA
	members []signerMember
	wait    []wait.Option
}

type signerMember struct {
	principal *harness.Principal
	role      string
}

// SignerOption changes how NewSigner creates a signer.
type SignerOption func(*signerConfig)

// SignerMember makes a principal, already a Product Member, a member of the signer with a
// role: admin, operator or auditor.
func SignerMember(p *harness.Principal, role string) SignerOption {
	return func(c *signerConfig) { c.members = append(c.members, signerMember{principal: p, role: role}) }
}

// IssuedBy issues the signer's certificate from ca instead of a new internal CA.
func IssuedBy(ca CA) SignerOption { return func(c *signerConfig) { c.ca = &ca } }

// WaitingUpTo changes how long CreateSigner waits for the certificate request, for CAs
// that issue on a queue.
func WaitingUpTo(opts ...wait.Option) SignerOption {
	return func(c *signerConfig) { c.wait = append(c.wait, opts...) }
}

// NewSigner creates an RSA-2048 signer and waits for it to leave pending; it requires the
// signer to become active. Without IssuedBy, a new internal CA issues the certificate.
func NewSigner(tt *testing.T, p *Project, opts ...SignerOption) Signer {
	tt.Helper()
	s, status, reason := CreateSigner(tt, p, opts...)
	require.Equalf(tt, "active", status, "the signer did not become active: %s", reason)
	return s
}

// CreateSigner creates an RSA-2048 signer and waits for it to leave pending, returning its
// status and the reason its certificate request failed, if it did.
func CreateSigner(tt *testing.T, p *Project, opts ...SignerOption) (Signer, string, string) {
	tt.Helper()
	cfg := signerConfig{}
	for _, opt := range opts {
		opt(&cfg)
	}
	if cfg.ca == nil {
		ca := NewInternalCA(tt, p)
		cfg.ca = &ca
	}
	body := api.CreateSignerJSONRequestBody{
		ProjectId:          new(p.ID.String()),
		Name:               "signer-" + id.Short(),
		CaId:               &cfg.ca.ID,
		CommonName:         new("Harness Code Signing"),
		CertificateTtlDays: new(30),
		KeyAlgorithm:       new(api.CreateSignerJSONBodyKeyAlgorithmRSA2048),
	}
	if len(cfg.members) > 0 {
		members := make([]struct {
			Id   uuid.UUID                           `json:"id"`
			Kind api.CreateSignerJSONBodyMembersKind `json:"kind"`
			Role string                              `json:"role"`
		}, 0, len(cfg.members))
		for _, m := range cfg.members {
			kind := api.CreateSignerJSONBodyMembersKindUser
			if m.principal.Kind == harness.MachineIdentity {
				kind = api.CreateSignerJSONBodyMembersKindIdentity
			}
			members = append(members, struct {
				Id   uuid.UUID                           `json:"id"`
				Kind api.CreateSignerJSONBodyMembersKind `json:"kind"`
				Role string                              `json:"role"`
			}{Id: m.principal.ID, Kind: kind, Role: m.role})
		}
		body.Members = &members
	}
	res, err := p.tn.Admin.API.CreateSignerWithResponse(tt.Context(), body)
	require.NoError(tt, err, "creating a signer")
	require.NotNilf(tt, res.JSON200, "creating a signer returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	s := Signer{ID: res.JSON200.Id, Project: p}
	status, reason := WaitSigner(tt, p.tn.Admin, s.ID, cfg.wait...)
	return s, status, reason
}

// WaitSigner waits for a signer to leave pending and returns its status and the reason
// its certificate request failed, if it did. Transport errors, 429s and 5xx responses are
// retried; any other refusal ends the wait at once.
func WaitSigner(tt *testing.T, as *harness.Principal, signerID uuid.UUID, opts ...wait.Option) (string, string) {
	tt.Helper()
	res := Poll(tt, "reading the signer", func(ctx context.Context) (*api.GetSignerByIdResponse, int, []byte, error) {
		res, status, body, err := ReadResponse(ctx, func(ctx context.Context) (*http.Response, error) {
			return as.API.GetSignerById(ctx, signerID)
		}, api.ParseGetSignerByIdResponse)
		if err == nil && status == http.StatusOK && res.JSON200 == nil {
			err = fmt.Errorf("content type %q", res.HTTPResponse.Header.Get("Content-Type"))
		}
		return res, status, body, err
	}, func(res *api.GetSignerByIdResponse) bool {
		return res.JSON200.Status != nil && *res.JSON200.Status != "pending"
	}, opts...)
	var reason string
	if res.JSON200.CertificateFailureReason != nil {
		reason = *res.JSON200.CertificateFailureReason
	}
	return *res.JSON200.Status, reason
}

// Sign asks the signer to sign the SHA-256 digest of a fresh artifact as `as`, and
// returns the response with the digest.
func Sign(tt *testing.T, as *harness.Principal, signerID uuid.UUID) (*api.SignDataResponse, []byte) {
	tt.Helper()
	sum := sha256.Sum256([]byte("artifact-" + id.Short()))
	res, err := as.API.SignDataWithResponse(tt.Context(), signerID, api.SignDataJSONRequestBody{
		Data:             base64.StdEncoding.EncodeToString(sum[:]),
		IsDigest:         new(true),
		SigningAlgorithm: api.SignDataJSONBodySigningAlgorithmRSASSAPKCS1V15SHA256,
	})
	require.NoError(tt, err, "signing")
	return res, sum[:]
}

// RequireApproval gives the signer a policy of one step that one approval from approver
// completes, allowing up to maxSignings signings per request.
func RequireApproval(tt *testing.T, s Signer, approver uuid.UUID, maxSignings int) {
	tt.Helper()
	var body api.UpdateSignerApprovalPolicyJSONRequestBody
	require.NoError(tt, json.Unmarshal(fmt.Appendf(nil, `{
		"steps": [{"stepNumber": 1, "requiredApprovals": 1, "approverUserIds": [%q]}],
		"constraints": {"maxSignings": %d}
	}`, approver, maxSignings), &body))
	res, err := s.Project.tn.Admin.API.UpdateSignerApprovalPolicyWithResponse(tt.Context(), s.ID, body)
	require.NoError(tt, err, "setting the signer's approval policy")
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "setting the signer's approval policy: %s", apierr.Body(res.Body))
}
