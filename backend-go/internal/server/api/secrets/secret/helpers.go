package secret

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
	secretsvc "github.com/infisical/api/internal/services/secrets/secret"
)

// parseTagSlugs parses a comma-separated string of tag slugs into a slice.
func parseTagSlugs(tagSlugsStr *string) []string {
	if tagSlugsStr == nil || *tagSlugsStr == "" {
		return nil
	}
	parts := strings.Split(*tagSlugsStr, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

// parseMetadataFilter parses a pipe-delimited string of metadata filters.
func parseMetadataFilter(metadataFilterStr *string) []secretsvc.MetadataFilter {
	if metadataFilterStr == nil || *metadataFilterStr == "" {
		return nil
	}

	pairs := strings.Split(*metadataFilterStr, "|")
	result := make([]secretsvc.MetadataFilter, 0, len(pairs))

	for _, pair := range pairs {
		entry := secretsvc.MetadataFilter{}
		parts := strings.SplitSeq(pair, ",")

		for part := range parts {
			kv := strings.SplitN(part, "=", 2)
			if len(kv) != 2 {
				continue
			}
			identifier := strings.TrimSpace(strings.ToLower(kv[0]))
			value := strings.TrimSpace(kv[1])

			switch identifier {
			case "key":
				entry.Key = value
			case "value":
				entry.Value = value
			}
		}

		if entry.Key != "" && entry.Value != "" {
			result = append(result, entry)
		}
	}

	if len(result) == 0 {
		return nil
	}
	return result
}

// getUserID extracts user ID from identity if actor is a user.
func getUserID(identity *auth.Identity) *uuid.UUID {
	if identity == nil {
		return nil
	}
	if identity.Actor == auth.ActorTypeUser {
		return &identity.ActorID
	}
	return nil
}

// getSecretType returns the secret type, defaulting to "shared" and forcing "shared" for non-user actors.
func getSecretType(identity *auth.Identity, requestedType string) string {
	if requestedType == "" {
		return "shared"
	}
	if identity == nil {
		return "shared"
	}
	switch identity.Actor {
	case auth.ActorTypeIdentity, auth.ActorTypeService:
		return "shared"
	default:
		return requestedType
	}
}

// CreateGetSecretsAuditLog creates an audit log entry for listing secrets.
// TODO: Re-enable once Go backend is primary - currently disabled to avoid duplicate logs with Node.js
func (h *Handler) CreateGetSecretsAuditLog(ctx context.Context, projectID, env, secretPath string, numberOfSecrets int) error {
	identity, err := auth.IdentityFromContext(ctx)
	if err != nil {
		return errutil.NotFound("Identity not found in context").WithErr(err)
	}

	info := auditlog.BuildAuditLogInfo(identity)
	if info == nil {
		return nil
	}

	dto := &auditlog.CreateAuditLogDTO{
		Event: auditlog.Event{
			Metadata: auditlog.GetSecretsEventMetadata{
				Environment:     env,
				SecretPath:      secretPath,
				NumberOfSecrets: numberOfSecrets,
			},
		},
		Actor:         info.Actor,
		ProjectID:     &projectID,
		IPAddress:     info.IPAddress,
		UserAgent:     info.UserAgent,
		UserAgentType: info.UserAgentType,
	}

	if err := h.auditLog.CreateAuditLog(ctx, dto); err != nil {
		return errutil.InternalServer("Failed to create audit log").WithErrf("createGetSecretsAuditLog: %w", err)
	}

	return nil
}
