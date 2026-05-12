package auditlog

import (
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/queue"
)

// TaskAuditLog is the typed task definition for audit log processing.
var TaskAuditLog = queue.NewTask[*CreateAuditLogDTO](queue.TaskNameAuditLog)

// EventType represents the type of audit event.
type EventType string

const (
	EventTypeGetSecrets EventType = "get-secrets"
	EventTypeGetSecret  EventType = "get-secret"
)

// EventMetadata is a sealed interface for event payloads.
// Each implementation defines its own event type, ensuring type safety.
type EventMetadata interface {
	eventType() EventType
}

// GetSecretsEventMetadata contains metadata for a get-secrets event.
type GetSecretsEventMetadata struct {
	Environment     string `json:"environment"`
	SecretPath      string `json:"secretPath"`
	NumberOfSecrets int    `json:"numberOfSecrets"`
}

func (GetSecretsEventMetadata) eventType() EventType { return EventTypeGetSecrets }

// SecretMetadataEntry represents a single metadata entry on a secret.
type SecretMetadataEntry struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// GetSecretEventMetadata contains metadata for a get-secret event.
type GetSecretEventMetadata struct {
	Environment    string                `json:"environment"`
	SecretPath     string                `json:"secretPath"`
	SecretID       string                `json:"secretId"`
	SecretKey      string                `json:"secretKey"`
	SecretVersion  int                   `json:"secretVersion"`
	SecretMetadata []SecretMetadataEntry `json:"secretMetadata,omitempty"`
}

func (GetSecretEventMetadata) eventType() EventType { return EventTypeGetSecret }

// Event represents an audited event. The type is derived from the metadata.
type Event struct {
	Metadata EventMetadata
}

// Type returns the event type derived from the metadata.
func (e Event) Type() EventType {
	return e.Metadata.eventType()
}

// MarshalJSON includes the eventType for proper deserialization.
func (e Event) MarshalJSON() ([]byte, error) {
	type eventJSON struct {
		Type     EventType `json:"type"`
		Metadata any       `json:"metadata"`
	}
	return json.Marshal(eventJSON{
		Type:     e.Metadata.eventType(),
		Metadata: e.Metadata,
	})
}

// UnmarshalJSON deserializes based on the eventType field.
func (e *Event) UnmarshalJSON(data []byte) error {
	var raw struct {
		Type     EventType       `json:"type"`
		Metadata json.RawMessage `json:"metadata"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	switch raw.Type {
	case EventTypeGetSecrets:
		var m GetSecretsEventMetadata
		if err := json.Unmarshal(raw.Metadata, &m); err != nil {
			return err
		}
		e.Metadata = m
	case EventTypeGetSecret:
		var m GetSecretEventMetadata
		if err := json.Unmarshal(raw.Metadata, &m); err != nil {
			return err
		}
		e.Metadata = m
	default:
		return fmt.Errorf("unknown event type: %s", raw.Type)
	}
	return nil
}

// CreateAuditLogDTO is the input for creating an audit log entry.
type CreateAuditLogDTO struct {
	Event         Event      `json:"event"`
	Actor         Actor      `json:"actor"`
	OrgID         *uuid.UUID `json:"orgId,omitempty"`
	ProjectID     *string    `json:"projectId,omitempty"`
	IPAddress     string     `json:"ipAddress,omitempty"`
	UserAgent     string     `json:"userAgent,omitempty"`
	UserAgentType string     `json:"userAgentType,omitempty"`
}
