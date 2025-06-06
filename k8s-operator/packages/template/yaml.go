package template

import (
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"
)

func toYAML(v any) string {
	data, err := yaml.Marshal(v)
	if err != nil {
		panic(fmt.Sprintf("Error: %v", err))

	}
	return strings.TrimSuffix(string(data), "\n")
}

// fromYAML converts a YAML document into a map[string]any.
//
// This is not a general-purpose YAML parser, and will not parse all valid
// YAML documents.
func fromYAML(str string) map[string]any {
	mapData := map[string]any{}

	if err := yaml.Unmarshal([]byte(str), &mapData); err != nil {
		panic(fmt.Sprintf("Error: %v", err))
	}
	return mapData
}
