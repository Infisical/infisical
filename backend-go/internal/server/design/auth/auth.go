package auth

import (
	. "goa.design/goa/v3/dsl"
)

// JWTAuth is the security scheme for user session JWT tokens.
var JWTAuth = JWTSecurity("jwt", func() {
	Description("User session JWT token via Authorization: Bearer header")
})

// IdentityAccessTokenAuth is the security scheme for machine identity tokens.
var IdentityAccessTokenAuth = JWTSecurity("identity_access_token", func() {
	Description("Machine identity access token via Authorization: Bearer header")
})

// ServiceTokenAuth is the security scheme for service tokens.
var ServiceTokenAuth = JWTSecurity("service_token", func() {
	Description("Service token via Authorization: Bearer header")
})

type securedBuilder struct{}

// Secured declares that the current method requires one of the given auth schemes.
// Multiple schemes provide OR semantics — any matching scheme authenticates the request.
// Chain with .Payload() to define the method payload with the Token field auto-injected.
func Secured(schemes ...any) *securedBuilder {
	for _, s := range schemes {
		Security(s)
	}

	return &securedBuilder{}
}

// Payload defines the method payload, automatically injecting the Token field
// required by JWTSecurity schemes.
func (b *securedBuilder) Payload(fn func()) {
	Payload(func() {
		Token("token", String)
		Required("token")
		fn()
	})
}
