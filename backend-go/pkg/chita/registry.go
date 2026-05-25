package chita

import (
	"maps"
	"sync"
)

// SchemaRegistry collects named schemas for OpenAPI components/schemas output.
// Use the global DefaultRegistry or create your own for testing.
type SchemaRegistry struct {
	mu      sync.RWMutex
	schemas map[string]Schema
}

// NewSchemaRegistry creates a new schema registry.
func NewSchemaRegistry() *SchemaRegistry {
	return &SchemaRegistry{
		schemas: make(map[string]Schema),
	}
}

// Register adds a schema to the registry under the given name.
// If a schema with the same name already exists, it is overwritten.
func (r *SchemaRegistry) Register(name string, schema Schema) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.schemas[name] = schema
}

// Get retrieves a schema by name. Returns nil if not found.
func (r *SchemaRegistry) Get(name string) Schema {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.schemas[name]
}

// All returns all registered schemas as a map.
func (r *SchemaRegistry) All() map[string]Schema {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make(map[string]Schema, len(r.schemas))
	maps.Copy(result, r.schemas)
	return result
}

// Clear removes all registered schemas (useful for testing).
func (r *SchemaRegistry) Clear() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.schemas = make(map[string]Schema)
}

// DefaultRegistry is the global schema registry used by Ref() methods.
var DefaultRegistry = NewSchemaRegistry()

// Refable is implemented by schemas that support $ref naming.
type Refable interface {
	Schema
	// RefName returns the registered name, or empty if not a ref.
	RefName() string
	// Definition returns the full schema definition (ignoring ref).
	Definition() map[string]any
}
