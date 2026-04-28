package permission

import (
	"github.com/infisical/gocasl"

	"github.com/infisical/api/internal/services/permission/project"
)

// CanDescribeSecret checks if the actor can see the secret exists (metadata).
// Supports both the new DescribeSecret permission and the legacy DescribeAndReadValue.
func CanDescribeSecret(
	ability *gocasl.Ability,
	environment string,
	secretPath string,
	secretName string,
	secretTags []string,
) bool {
	subject := project.SecretSubject{
		Environment: environment,
		SecretPath:  secretPath,
		SecretName:  secretName,
		SecretTags:  secretTags,
	}

	canDescribe := gocasl.Can(ability, project.SecretActionDescribeSecret, subject)
	canLegacy := gocasl.Can(ability, project.SecretActionDescribeAndReadValue, subject)

	return canDescribe || canLegacy
}

// CanReadSecretValue checks if the actor can read the decrypted secret value.
// Supports both the new ReadValue permission and the legacy DescribeAndReadValue.
func CanReadSecretValue(
	ability *gocasl.Ability,
	environment string,
	secretPath string,
	secretName string,
	secretTags []string,
) bool {
	subject := project.SecretSubject{
		Environment: environment,
		SecretPath:  secretPath,
		SecretName:  secretName,
		SecretTags:  secretTags,
	}

	canRead := gocasl.Can(ability, project.SecretActionReadValue, subject)
	canLegacy := gocasl.Can(ability, project.SecretActionDescribeAndReadValue, subject)

	return canRead || canLegacy
}
