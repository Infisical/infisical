package auditlog

// ActorType represents the type of actor performing the action.
type ActorType string

const (
	ActorTypeUser     ActorType = "user"
	ActorTypeIdentity ActorType = "identity"
	ActorTypeService  ActorType = "service"
	ActorTypePlatform ActorType = "platform"
)

// UserActorMetadata contains metadata for a user actor.
type UserActorMetadata struct {
	UserID     string         `json:"userId"`
	Email      string         `json:"email,omitempty"`
	Username   string         `json:"username"`
	AuthMethod string         `json:"authMethod,omitempty"`
	Permission map[string]any `json:"permission,omitempty"`
}

// IdentityActorMetadata contains metadata for an identity (machine) actor.
type IdentityActorMetadata struct {
	IdentityID string         `json:"identityId"`
	Name       string         `json:"name"`
	AuthMethod string         `json:"authMethod,omitempty"`
	Permission map[string]any `json:"permission,omitempty"`
}

// ServiceActorMetadata contains metadata for a service token actor.
type ServiceActorMetadata struct {
	ServiceID string `json:"serviceId"`
	Name      string `json:"name"`
}

// Actor represents the entity performing an audited action.
type Actor struct {
	Type     ActorType `json:"type"`
	Metadata any       `json:"metadata"`
}
