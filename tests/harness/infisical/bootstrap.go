package infisical

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Credentials the harness bootstraps an instance with.
//
// Fixed rather than generated, for the same reason as AUTH_SECRET: a container is
// adopted by name, so a second test binary inherits an instance it did not create
// and has to be able to log in as the same administrator.
const (
	RootEmail    = "harness-root@infisical.test"
	RootPassword = "HarnessRootPassword7!"
	RootOrgName  = "harness-root"
)

// Root is what bootstrapping an instance yields.
//
// Three principals come out of one call, and they are deliberately used for
// different things:
//
//   - The USER is the only one that can create an organization, because
//     POST /api/v2/organizations checks req.auth.actor !== ActorType.USER. The
//     harness keeps its password privately to mint tenants and never exposes it.
//   - The IDENTITY passes verifySuperAdmin, because isSuperAdmin accepts
//     ActorType.IDENTITY when auth.isInstanceAdmin, which bootstrapInstance arranges.
//     It carries no user-level state a test could corrupt, so it is what instance
//     level suites get.
//   - The organization it creates is incidental. Tenants make their own.
type Root struct {
	UserID        string
	Email         string
	Password      string
	OrgID         string
	IdentityID    string
	IdentityToken string
}

type bootstrapResponse struct {
	User struct {
		ID       string `json:"id"`
		Username string `json:"username"`
	} `json:"user"`
	Organization struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
	} `json:"organization"`
	Identity struct {
		ID          string `json:"id"`
		Credentials struct {
			Token string `json:"token"`
		} `json:"credentials"`
	} `json:"identity"`
}

// Bootstrap prepares a freshly migrated instance.
//
// POST /api/v1/admin/bootstrap is one shot per database: it refuses once
// serverCfg.initialized is set. An adopted container is therefore already
// bootstrapped, and the second caller logs in instead.
func Bootstrap(ctx context.Context, baseURL string) (Root, error) {
	c := &http.Client{Timeout: 30 * time.Second}

	var out bootstrapResponse
	code, body, err := post(ctx, c, baseURL+"/api/v1/admin/bootstrap", "", map[string]string{
		"email":        RootEmail,
		"password":     RootPassword,
		"organization": RootOrgName,
	}, &out)
	if err != nil {
		return Root{}, err
	}

	switch {
	case code == http.StatusOK:
	case alreadyBootstrapped(code, body):
		return adopt(ctx, c, baseURL)
	default:
		return Root{}, fmt.Errorf("infisical: bootstrap returned %d: %s", code, trunc(body))
	}

	root := Root{
		UserID:        out.User.ID,
		Email:         RootEmail,
		Password:      RootPassword,
		OrgID:         out.Organization.ID,
		IdentityID:    out.Identity.ID,
		IdentityToken: out.Identity.Credentials.Token,
	}

	// bootstrapInstance sets allowSignUp:false whenever the instance is not cloud.
	// Without turning it back on, creating a second real user is impossible, and
	// that is the only path to a non-administrator principal.
	if err := allowSignUp(ctx, c, baseURL, root.IdentityToken); err != nil {
		return Root{}, err
	}
	return root, nil
}

func adopt(ctx context.Context, c *http.Client, baseURL string) (Root, error) {
	var login struct {
		AccessToken string `json:"accessToken"`
	}
	code, body, err := post(ctx, c, baseURL+"/api/v3/auth/login", "", map[string]string{
		"email":    RootEmail,
		"password": RootPassword,
	}, &login)
	if err != nil {
		return Root{}, err
	}
	if code != http.StatusOK {
		return Root{}, fmt.Errorf(
			"infisical: this instance is already bootstrapped but the harness root cannot log in (%d: %s).\n"+
				"It was probably bootstrapped by something other than the harness. Run `inf down` and retry.",
			code, trunc(body))
	}
	return Root{Email: RootEmail, Password: RootPassword}, nil
}

func allowSignUp(ctx context.Context, c *http.Client, baseURL, token string) error {
	code, body, err := patch(ctx, c, baseURL+"/api/v1/admin/config", token, map[string]any{
		"allowSignUp": true,
	})
	if err != nil {
		return err
	}
	if code != http.StatusOK {
		return fmt.Errorf("infisical: re-enabling signup returned %d: %s", code, trunc(body))
	}
	return nil
}

// alreadyBootstrapped recognises the one failure that is expected and recoverable.
func alreadyBootstrapped(code int, body string) bool {
	return code == http.StatusBadRequest && bytes.Contains([]byte(body), []byte("already"))
}

func post(ctx context.Context, c *http.Client, url, token string, in, out any) (int, string, error) {
	return do(ctx, c, http.MethodPost, url, token, in, out)
}

func patch(ctx context.Context, c *http.Client, url, token string, in any) (int, string, error) {
	return do(ctx, c, http.MethodPatch, url, token, in, nil)
}

func do(ctx context.Context, c *http.Client, method, url, token string, in, out any) (int, string, error) {
	buf, err := json.Marshal(in)
	if err != nil {
		return 0, "", err
	}
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(buf))
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Content-Type", "application/json")
	// completeAccount rejects a request without one, so send it everywhere.
	req.Header.Set("User-Agent", "infisical-harness")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := c.Do(req)
	if err != nil {
		return 0, "", fmt.Errorf("infisical: %s %s: %w", method, url, err)
	}
	defer func() { _ = resp.Body.Close() }()

	body, _ := io.ReadAll(resp.Body)
	if out != nil && resp.StatusCode == http.StatusOK {
		if err := json.Unmarshal(body, out); err != nil {
			return resp.StatusCode, string(body), fmt.Errorf("infisical: decoding %s: %w", url, err)
		}
	}
	return resp.StatusCode, string(body), nil
}

func trunc(s string) string {
	if len(s) > 400 {
		return s[:400] + "..."
	}
	return s
}
