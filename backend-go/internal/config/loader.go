package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
)

// Loader loads configuration from environment variables with validation.
// It collects all errors so you can see every missing/invalid var at once.
type Loader struct {
	errs []error
}

// Required loads a required string env var. Adds error if missing.
func (l *Loader) Required(dst *string, key string) *Loader {
	val := os.Getenv(key)
	if val == "" {
		l.errs = append(l.errs, fmt.Errorf("required: %s", key))
		return l
	}
	*dst = val
	return l
}

// Optional loads an optional string env var with a default.
func (l *Loader) Optional(dst *string, key, defaultVal string) *Loader {
	if val := os.Getenv(key); val != "" {
		*dst = val
	} else {
		*dst = defaultVal
	}
	return l
}

// RequiredInt loads a required int env var.
func (l *Loader) RequiredInt(dst *int, key string) *Loader {
	val := os.Getenv(key)
	if val == "" {
		l.errs = append(l.errs, fmt.Errorf("required: %s", key))
		return l
	}
	i, err := strconv.Atoi(val)
	if err != nil {
		l.errs = append(l.errs, fmt.Errorf("%s: invalid int %q", key, val))
		return l
	}
	*dst = i
	return l
}

// OptionalInt loads an optional int env var with a default.
func (l *Loader) OptionalInt(dst *int, key string, defaultVal int) *Loader {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			*dst = i
			return l
		}
	}
	*dst = defaultVal
	return l
}

// OptionalFloat loads an optional float64 env var with a default.
func (l *Loader) OptionalFloat(dst *float64, key string, defaultVal float64) *Loader {
	if val := os.Getenv(key); val != "" {
		if f, err := strconv.ParseFloat(val, 64); err == nil {
			*dst = f
			return l
		}
	}
	*dst = defaultVal
	return l
}

// OptionalBool loads an optional bool env var with a default.
// Accepts: 1, t, T, TRUE, true, True, 0, f, F, FALSE, false, False
func (l *Loader) OptionalBool(dst *bool, key string, defaultVal bool) *Loader {
	if val := os.Getenv(key); val != "" {
		if b, err := strconv.ParseBool(val); err == nil {
			*dst = b
			return l
		}
	}
	*dst = defaultVal
	return l
}

// Err returns all collected errors joined together.
func (l *Loader) Err() error {
	return errors.Join(l.errs...)
}
