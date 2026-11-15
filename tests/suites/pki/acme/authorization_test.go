package acme_test

import (
	"regexp"
	"slices"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestAcmeAuthorization_Get(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should offer pending HTTP-01 and DNS-01 challenges for a DNS name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		c := newAcmeProfile(t, tn).registered(t)
		name := domain("www")
		o := c.NewOrder(t, name)

		// Action
		a := c.Authorization(t, o.Authorizations[0])

		// Assert
		require.Regexp(t, "^"+regexp.QuoteMeta(c.URL(c.profilePath()+"/authorizations/"))+".+$", o.Authorizations[0])
		require.Equal(t, "pending", a.Status)
		require.Equal(t, identifier{Type: "dns", Value: name}, a.Identifier)
		var got []challengeBody
		for _, ch := range a.Challenges {
			got = append(got, challengeBody{Type: ch.Type, Status: ch.Status})
		}
		slices.SortFunc(got, func(x, y challengeBody) int { return compare(x.Type, y.Type) })
		require.Equal(t, []challengeBody{{Type: "dns-01", Status: "pending"}, {Type: "http-01", Status: "pending"}}, got)
	})
}

func compare(a, b string) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	}
	return 0
}
