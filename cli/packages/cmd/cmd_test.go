package cmd

import (
	"testing"

	"github.com/Infisical/infisical-merge/packages/models"
)

func TestFilterReservedEnvVars(t *testing.T) {

	// some test env vars.
	// HOME and PATH are reserved key words and should be filtered out
	// XDG_SESSION_ID and LC_CTYPE are reserved key word prefixes and should be filtered out
	// The filter function only checks the keys of the env map, so we dont need to set any values
	env := map[string]models.SingleEnvironmentVariable{
		"test":           {},
		"test2":          {},
		"HOME":           {},
		"PATH":           {},
		"XDG_SESSION_ID": {},
		"LC_CTYPE":       {},
	}

	// check to see if there are any reserved key words in secrets to inject
	filterReservedEnvVars(env)

	if len(env) != 2 {
		t.Errorf("Expected 2 secrets to be returned, got %d", len(env))
	}
	if _, ok := env["test"]; !ok {
		t.Errorf("Expected test to be returned")
	}
	if _, ok := env["test2"]; !ok {
		t.Errorf("Expected test2 to be returned")
	}
	if _, ok := env["HOME"]; ok {
		t.Errorf("Expected HOME to be filtered out")
	}
	if _, ok := env["PATH"]; ok {
		t.Errorf("Expected PATH to be filtered out")
	}
	if _, ok := env["XDG_SESSION_ID"]; ok {
		t.Errorf("Expected XDG_SESSION_ID to be filtered out")
	}
	if _, ok := env["LC_CTYPE"]; ok {
		t.Errorf("Expected LC_CTYPE to be filtered out")
	}

}

func TestExportAsDotEnv(t *testing.T) {
	envs := []models.SingleEnvironmentVariable{
		{Key: "key1", Value: "val1"},
		{Key: "key2", Value: "val2"},
		{Key: "key3", Value: "val3"},
	}

	res := "key1='val1'\nkey2='val2'\nkey3='val3'\n"
	out, err := formatEnvs(envs, FormatDotenv, "", "")
	if err != nil {
		t.Errorf("formatEnvs failed")
	}
	if res != out {
		t.Errorf("failed to export to .env")
	}

	res = "key1=\"val1\"\nkey2=\"val2\"\nkey3=\"val3\"\n"
	out, err = formatEnvs(envs, FormatDotenv, "", `"`)
	if err != nil {
		t.Errorf("formatEnvs failed")
	}
	if res != out {
		t.Errorf("failed to replace quota")
	}
}

func TestExportAsDotEnvExport(t *testing.T) {
	envs := []models.SingleEnvironmentVariable{
		{Key: "key1", Value: "val1"},
		{Key: "key2", Value: "val2"},
		{Key: "key3", Value: "val3"},
	}

	res := "export key1='val1'\nexport key2='val2'\nexport key3='val3'\n"
	out, err := formatEnvs(envs, FormatDotEnvExport, "", "")
	if err != nil {
		t.Errorf("formatEnvs failed")
	}
	if res != out {
		t.Errorf("failed to export to .env")
	}

	res = "export key1=\"val1\"\nexport key2=\"val2\"\nexport key3=\"val3\"\n"
	out, err = formatEnvs(envs, FormatDotEnvExport, "", `"`)
	if err != nil {
		t.Errorf("formatEnvs failed")
	}
	if res != out {
		t.Errorf("failed to replace quota")
	}
}

func TestExportAsCSV(t *testing.T) {
	envs := []models.SingleEnvironmentVariable{
		{Key: "key1", Value: "val1"},
		{Key: "key2", Value: "val2"},
		{Key: "key3", Value: "val3"},
	}

	res := "Key,Value\nkey1,val1\nkey2,val2\nkey3,val3\n"
	out, err := formatEnvs(envs, FormatCSV, "", "")
	if err != nil {
		t.Errorf("formatEnvs failed")
	}
	if res != out {
		t.Errorf("failed to export to .env")
	}

	res = "Key/Value\nkey1/val1\nkey2/val2\nkey3/val3\n"
	out, err = formatEnvs(envs, FormatCSV, "/", "")
	if err != nil {
		t.Errorf("formatEnvs failed")
	}
	if res != out {
		t.Errorf("failed to replace delimiter")
	}
}
