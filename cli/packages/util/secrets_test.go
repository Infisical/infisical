package util

import (
	"testing"

	"github.com/Infisical/infisical-merge/packages/models"
)

// References to self should return the value unaltered
func Test_SubstituteSecrets_When_ReferenceToSelf(t *testing.T) {

	var tests = []struct {
		Key           string
		Value         string
		ExpectedValue string
	}{
		{Key: "A", Value: "${A}", ExpectedValue: "${A}"},
		{Key: "A", Value: "${A} ${A}", ExpectedValue: "${A} ${A}"},
		{Key: "A", Value: "${A}${A}", ExpectedValue: "${A}${A}"},
	}

	for _, test := range tests {
		secret := models.SingleEnvironmentVariable{
			Key:   test.Key,
			Value: test.Value,
		}

		secrets := []models.SingleEnvironmentVariable{secret}
		result := SubstituteSecrets(secrets)

		if result[0].Value != test.ExpectedValue {
			t.Errorf("Test_SubstituteSecrets_When_ReferenceToSelf: expected %s but got %s for input %s", test.ExpectedValue, result[0].Value, test.Value)
		}

	}
}

func Test_SubstituteSecrets_When_ReferenceDoesNotExist(t *testing.T) {

	var tests = []struct {
		Key           string
		Value         string
		ExpectedValue string
	}{
		{Key: "A", Value: "${X}", ExpectedValue: "${X}"},
		{Key: "A", Value: "${H}HELLO", ExpectedValue: "${H}HELLO"},
		{Key: "A", Value: "${L}${S}", ExpectedValue: "${L}${S}"},
	}

	for _, test := range tests {
		secret := models.SingleEnvironmentVariable{
			Key:   test.Key,
			Value: test.Value,
		}

		secrets := []models.SingleEnvironmentVariable{secret}
		result := SubstituteSecrets(secrets)

		if result[0].Value != test.ExpectedValue {
			t.Errorf("Test_SubstituteSecrets_When_ReferenceToSelf: expected %s but got %s for input %s", test.ExpectedValue, result[0].Value, test.Value)
		}

	}
}

func Test_SubstituteSecrets_When_ReferenceDoesNotExist_And_Self_Referencing(t *testing.T) {

	tests := []struct {
		Key           string
		Value         string
		ExpectedValue string
	}{
		{
			Key:           "O",
			Value:         "${P} ==$$ ${X} ${UNKNOWN} ${A}",
			ExpectedValue: "DOMAIN === ${A} DOMAIN >>> ==$$ DOMAIN ${UNKNOWN} ${A}",
		},
		{
			Key:           "X",
			Value:         "DOMAIN",
			ExpectedValue: "DOMAIN",
		},
		{
			Key:           "A",
			Value:         "*${A}* ${X}",
			ExpectedValue: "*${A}* DOMAIN",
		},
		{
			Key:           "H",
			Value:         "${X} >>>",
			ExpectedValue: "DOMAIN >>>",
		},
		{
			Key:           "P",
			Value:         "DOMAIN === ${A} ${H}",
			ExpectedValue: "DOMAIN === ${A} DOMAIN >>>",
		},
		{
			Key:           "T",
			Value:         "${P} ==$$ ${X} ${UNKNOWN} ${A} ${P} ==$$ ${X} ${UNKNOWN} ${A}",
			ExpectedValue: "DOMAIN === ${A} DOMAIN >>> ==$$ DOMAIN ${UNKNOWN} ${A} DOMAIN === ${A} DOMAIN >>> ==$$ DOMAIN ${UNKNOWN} ${A}",
		},
		{
			Key:           "S",
			Value:         "${ SSS$$ ${HEY}",
			ExpectedValue: "${ SSS$$ ${HEY}",
		},
	}

	secrets := []models.SingleEnvironmentVariable{}
	for _, test := range tests {
		secrets = append(secrets, models.SingleEnvironmentVariable{Key: test.Key, Value: test.Value})
	}

	results := SubstituteSecrets(secrets)

	for index, expanded := range results {
		if expanded.Value != tests[index].ExpectedValue {
			t.Errorf("Test_SubstituteSecrets_When_ReferenceToSelf: expected [%s] but got [%s] for input [%s]", tests[index].ExpectedValue, expanded.Value, tests[index].Value)
		}
	}
}

func Test_SubstituteSecrets_When_No_SubstituteNeeded(t *testing.T) {

	tests := []struct {
		Key           string
		Value         string
		ExpectedValue string
	}{
		{
			Key:           "DOMAIN",
			Value:         "infisical.com",
			ExpectedValue: "infisical.com",
		},
		{
			Key:           "API_KEY",
			Value:         "hdgsvjshcgkdckhevdkd",
			ExpectedValue: "hdgsvjshcgkdckhevdkd",
		},
		{
			Key:           "ENV",
			Value:         "PROD",
			ExpectedValue: "PROD",
		},
	}

	secrets := []models.SingleEnvironmentVariable{}
	for _, test := range tests {
		secrets = append(secrets, models.SingleEnvironmentVariable{Key: test.Key, Value: test.Value})
	}

	results := SubstituteSecrets(secrets)

	for index, expanded := range results {
		if expanded.Value != tests[index].ExpectedValue {
			t.Errorf("Test_SubstituteSecrets_When_ReferenceToSelf: expected [%s] but got [%s] for input [%s]", tests[index].ExpectedValue, expanded.Value, tests[index].Value)
		}
	}
}
