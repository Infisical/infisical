package secretmanager

import (
	"github.com/infisical/gocasl"

	"github.com/infisical/api/internal/services/permission/project"
)

// SecretAccessChecker implements permission checks for secret operations.
// It wraps a gocasl.Ability and checks both new granular permissions
// and legacy DescribeAndReadValue for backwards compatibility.
type SecretAccessChecker struct {
	ability *gocasl.Ability
}

// NewSecretAccessChecker creates a SecretAccessChecker from a CASL ability.
func NewSecretAccessChecker(ability *gocasl.Ability) *SecretAccessChecker {
	return &SecretAccessChecker{ability: ability}
}

// CanDescribeSecret checks if the actor can see that the secret exists (metadata).
// Supports both the new DescribeSecret permission and the legacy DescribeAndReadValue.
func (c *SecretAccessChecker) CanDescribeSecret(env, path, key string, tagSlugs []string) bool {
	subject := project.SecretSubject{
		Environment: env,
		SecretPath:  path,
		SecretName:  key,
		SecretTags:  tagSlugs,
	}

	canDescribe := gocasl.Can(c.ability, project.SecretActionDescribeSecret, subject)
	canLegacy := gocasl.Can(c.ability, project.SecretActionDescribeAndReadValue, subject)

	return canDescribe || canLegacy
}

// CanReadSecretValue checks if the actor can read the decrypted secret value.
// Supports both the new ReadValue permission and the legacy DescribeAndReadValue.
func (c *SecretAccessChecker) CanReadSecretValue(env, path, key string, tagSlugs []string) bool {
	subject := project.SecretSubject{
		Environment: env,
		SecretPath:  path,
		SecretName:  key,
		SecretTags:  tagSlugs,
	}

	canRead := gocasl.Can(c.ability, project.SecretActionReadValue, subject)
	canLegacy := gocasl.Can(c.ability, project.SecretActionDescribeAndReadValue, subject)

	return canRead || canLegacy
}
