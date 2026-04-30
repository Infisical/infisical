package auditlog

import (
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission"
)

// AuditLogInfo holds the pre-built audit log context from an identity.
// This is the Go equivalent of Node.js req.auditLogInfo.
type AuditLogInfo struct {
	Actor         Actor
	IPAddress     string
	UserAgent     string
	UserAgentType string
}

// BuildAuditLogInfo creates an AuditLogInfo from an Identity.
// This is a reusable helper that matches the Node.js injectAuditLogInfo plugin.
func BuildAuditLogInfo(identity *auth.Identity) *AuditLogInfo {
	if identity == nil {
		return nil
	}

	return &AuditLogInfo{
		Actor:         buildActor(identity),
		IPAddress:     identity.IPAddress,
		UserAgent:     identity.UserAgent,
		UserAgentType: identity.UserAgentType,
	}
}

func buildActor(identity *auth.Identity) Actor {
	switch identity.Actor {
	case permission.ActorTypeUser:
		return Actor{
			Type: ActorTypeUser,
			Metadata: UserActorMetadata{
				UserID:     identity.ActorID.String(),
				Email:      identity.Email,
				Username:   identity.Username,
				AuthMethod: string(identity.AuthMethod),
			},
		}
	case permission.ActorTypeIdentity:
		return Actor{
			Type: ActorTypeIdentity,
			Metadata: IdentityActorMetadata{
				IdentityID: identity.ActorID.String(),
				Name:       identity.Name,
				AuthMethod: string(identity.AuthMethod),
			},
		}
	case permission.ActorTypeService:
		return Actor{
			Type: ActorTypeService,
			Metadata: ServiceActorMetadata{
				ServiceID: identity.ActorID.String(),
				Name:      identity.Name,
			},
		}
	default:
		return Actor{
			Type:     ActorType(identity.Actor),
			Metadata: nil,
		}
	}
}
