package generator

import (
	"github.com/google/uuid"
)

func GeneratorUUID() (string, error) {
	uuid := uuid.New().String()
	return uuid, nil
}
