package project

import (
	"github.com/infisical/gocasl"
)

// AssumePrivilegeChecker implements permission checks for assume privilege operations.
type AssumePrivilegeChecker struct {
	ability *gocasl.Ability
}

// NewAssumePrivilegeChecker creates an AssumePrivilegeChecker from a CASL ability.
func NewAssumePrivilegeChecker(ability *gocasl.Ability) *AssumePrivilegeChecker {
	return &AssumePrivilegeChecker{ability: ability}
}

// CanAssumeMemberPrivileges checks if the actor can assume another member's privileges.
func (c *AssumePrivilegeChecker) CanAssumeMemberPrivileges() bool {
	return gocasl.Can(c.ability, MemberActionAssumePrivileges, MemberSubject{})
}

// CanAssumeIdentityPrivileges checks if the actor can assume an identity's privileges.
func (c *AssumePrivilegeChecker) CanAssumeIdentityPrivileges(identityID string) bool {
	subject := IdentitySubject{
		IdentityID: identityID,
	}
	return gocasl.Can(c.ability, IdentityActionAssumePrivileges, subject)
}
