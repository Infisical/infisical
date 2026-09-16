package infisical

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"
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
// Three principals come out of one call, deliberately used for different things:
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
	UserID        uuid.UUID
	Email         string
	Password      string
	OrgID         uuid.UUID
	IdentityID    uuid.UUID
	IdentityToken string
}

// Bootstrap prepares a freshly migrated instance.
//
// POST /api/v1/admin/bootstrap is one shot per database: it refuses once
// serverCfg.initialized is set. An adopted container is therefore already
// bootstrapped, and the second caller logs in instead.
func Bootstrap(ctx context.Context, baseURL string) (Root, error) {
	c, err := NewClient(baseURL)
	if err != nil {
		return Root{}, err
	}

	res, err := c.AdminBootstrapWithResponse(ctx, api.AdminBootstrapJSONRequestBody{
		Email:        openapi_types.Email(RootEmail),
		Password:     RootPassword,
		Organization: RootOrgName,
	})
	if err != nil {
		return Root{}, fmt.Errorf("infisical: bootstrap: %w", err)
	}

	switch {
	case res.StatusCode() == http.StatusOK && res.JSON200 != nil:
	case alreadyBootstrapped(res.StatusCode(), res.Body):
		// An adopted instance. The credentials are constants, so this is recoverable
		// rather than fatal: log in and carry on with what the first caller created.
		return adopt(ctx, c)
	default:
		return Root{}, apiError("bootstrap", res.StatusCode(), res.Body)
	}

	body := res.JSON200
	root := Root{
		UserID:        body.User.Id,
		Email:         RootEmail,
		Password:      RootPassword,
		OrgID:         body.Organization.Id,
		IdentityID:    body.Identity.Id,
		IdentityToken: body.Identity.Credentials.Token,
	}

	// bootstrapInstance sets allowSignUp:false whenever the instance is not cloud.
	// Without turning it back on, creating a second real user is impossible, and that
	// is the only path to a non-administrator principal.
	if err := allowSignUp(ctx, baseURL, root.IdentityToken); err != nil {
		return Root{}, err
	}
	return root, nil
}

func adopt(ctx context.Context, c *api.ClientWithResponses) (Root, error) {
	res, err := c.LoginV3WithResponse(ctx, api.LoginV3JSONRequestBody{
		Email:    RootEmail,
		Password: RootPassword,
	})
	if err != nil {
		return Root{}, fmt.Errorf("infisical: logging in as the harness root: %w", err)
	}
	if res.StatusCode() != http.StatusOK {
		return Root{}, fmt.Errorf(
			"infisical: this instance is already bootstrapped but the harness root cannot log in (%d).\n"+
				"It was probably bootstrapped by something other than the harness, so run `inf down` and retry",
			res.StatusCode())
	}
	return Root{Email: RootEmail, Password: RootPassword}, nil
}

func allowSignUp(ctx context.Context, baseURL, token string) error {
	c, err := NewClient(baseURL, BearerAuth(token))
	if err != nil {
		return err
	}
	res, err := c.UpdateAdminConfigWithResponse(ctx, api.UpdateAdminConfigJSONRequestBody{
		AllowSignUp: new(true),
	})
	if err != nil {
		return fmt.Errorf("infisical: re-enabling signup: %w", err)
	}
	if res.StatusCode() != http.StatusOK {
		return apiError("re-enabling signup", res.StatusCode(), res.Body)
	}
	return nil
}

// alreadyBootstrapped recognises the one failure that is expected and recoverable.
func alreadyBootstrapped(status int, body []byte) bool {
	return status == http.StatusBadRequest && strings.Contains(string(body), "already")
}
