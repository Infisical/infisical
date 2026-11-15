package keys_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

// roleProject is a KMS project with one key of each usage, for sweeping every key route as one principal.
type roleProject struct {
	proj       *fixture.Project
	aes        kms.Key
	signing    kms.Key
	mac        kms.Key
	disposable kms.Key
	ciphertext string
	validMac   string
}

func newRoleProject(t *testing.T, h *harness.Stack) roleProject {
	t.Helper()
	proj := newProject(t, h.NewTenant(t))
	aes := kms.NewKey(t, proj)
	mac := kms.NewKey(t, proj, kms.WithUsage(kms.MAC), kms.WithAlgorithm("HMAC_SHA_256"))
	_, generated := keyOperations()["generate mac"](t, proj.Tenant().Admin.API, mac.ID)
	return roleProject{
		proj:       proj,
		aes:        aes,
		signing:    kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ED25519")),
		mac:        mac,
		disposable: kms.NewKey(t, proj),
		ciphertext: kms.Encrypt(t, proj, aes.ID, []byte("value")),
		validMac:   kms.Decode[struct{ Mac string }](t, generated).Mac,
	}
}

// sweep calls every key route once as the principal and returns each status by route. Delete runs last so the
// other routes see the keys.
func (r roleProject) sweep(t *testing.T, pr *harness.Principal) map[string]int {
	t.Helper()
	ops := keyOperations()
	status := func(name string, keyID kms.Key) int {
		got, _ := ops[name](t, pr.API, keyID.ID)
		return got
	}
	list, err := pr.API.ListKmsKeysWithResponse(t.Context(), &api.ListKmsKeysParams{ProjectId: r.proj.ID})
	require.NoError(t, err)
	create, err := pr.API.CreateKmsKeyWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t, kms.CreateBody(r.proj)))
	require.NoError(t, err)
	verify, err := pr.API.VerifyWithKmsKeyWithBodyWithResponse(t.Context(), r.signing.ID, "application/json",
		kms.JSON(t, map[string]any{"signingAlgorithm": "ED25519", "data": b64("message"), "signature": b64("signature")}))
	require.NoError(t, err)
	sign, _ := signWith(t, pr.API, r.signing.ID, "ED25519")
	byName, err := pr.API.GetKmsKeyByNameWithResponse(t.Context(), r.aes.Name, &api.GetKmsKeyByNameParams{ProjectId: r.proj.ID})
	require.NoError(t, err)
	verifyMac, err := pr.API.VerifyMacWithKmsKeyWithBodyWithResponse(t.Context(), r.mac.ID, "application/json",
		kms.JSON(t, map[string]any{"data": b64("message"), "mac": r.validMac}))
	require.NoError(t, err)

	return map[string]int{
		"list":               list.StatusCode(),
		"get":                status("get", r.aes),
		"get by name":        byName.StatusCode(),
		"create":             create.StatusCode(),
		"edit":               status("update", r.aes),
		"rotate":             status("rotate", r.aes),
		"encrypt":            status("encrypt", r.aes),
		"decrypt":            kms.DecryptResponse(t, pr.API, r.aes.ID, r.ciphertext).StatusCode(),
		"sign":               sign,
		"verify":             verify.StatusCode(),
		"public key":         status("public key", r.signing),
		"signing algorithms": status("signing algorithms", r.signing),
		"generate mac":       status("generate mac", r.mac),
		"verify mac":         verifyMac.StatusCode(),
		"export":             status("private key", r.aes),
		"delete":             status("delete", r.disposable),
	}
}

// outcomes maps every swept route to forbidden, then to ok for the routes listed.
func outcomes(allowed ...string) map[string]int {
	out := map[string]int{}
	for _, route := range []string{"list", "get", "get by name", "create", "edit", "rotate", "encrypt", "decrypt", "sign",
		"verify", "public key", "signing algorithms", "generate mac", "verify mac", "export", "delete"} {
		out[route] = http.StatusForbidden
	}
	for _, route := range allowed {
		out[route] = http.StatusOK
	}
	return out
}

func TestKmsKey_Roles(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	everything := []string{"list", "get", "get by name", "create", "edit", "rotate", "encrypt", "decrypt", "sign", "verify",
		"public key", "signing algorithms", "generate mac", "verify mac", "export", "delete"}
	member := []string{"list", "get", "get by name", "create", "edit", "rotate", "encrypt", "decrypt", "sign", "verify",
		"public key", "signing algorithms", "generate mac", "verify mac", "delete"}
	cryptographic := []string{"encrypt", "decrypt", "sign", "verify", "public key", "signing algorithms", "generate mac", "verify mac"}

	cases := []struct {
		name    string
		role    string
		allowed []string
	}{
		{"should let an admin use every key route", "admin", everything},
		{"should let a member use every key route except export", "member", member},
		{"should let a viewer read keys and public keys but use and change nothing", "viewer",
			[]string{"list", "get", "get by name", "public key", "signing algorithms"}},
		{"should let a cryptographic operator use keys and read public keys, but not list, change or export them",
			"cryptographic-operator", cryptographic},
		{"should refuse no-access on every key route", "no-access", nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()

			// Setup
			r := newRoleProject(t, h)
			pr := r.proj.NewMachineIdentity(t, fixture.WithRoles(c.role))
			want := outcomes(c.allowed...)

			// Action
			got := r.sweep(t, pr)

			// Assert
			require.Equal(t, want, got)
		})
	}

	t.Run("should give a user the same outcomes as a machine identity with the same role", func(t *testing.T) {
		t.Parallel()

		// Setup
		r := newRoleProject(t, h)
		user := r.proj.NewUser(t, fixture.WithRoles("cryptographic-operator"))

		// Action
		got := r.sweep(t, user)

		// Assert
		require.Equal(t, outcomes(cryptographic...), got)
	})

	t.Run("should let a custom role that grants only encrypt encrypt but not decrypt", func(t *testing.T) {
		t.Parallel()

		// Setup
		r := newRoleProject(t, h)
		r.proj.NewRole(t, "encrypt-only", fixture.Permission{Subject: "cmek", Action: []string{"encrypt"}})
		pr := r.proj.NewMachineIdentity(t, fixture.WithRoles("encrypt-only"))

		// Action
		got := r.sweep(t, pr)

		// Assert
		require.Equal(t, outcomes("encrypt"), got)
	})
}
