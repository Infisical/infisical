package util

import (
	"testing"

	"github.com/Infisical/infisical-merge/packages/models"
)

// References to self should return the value unaltered
// func Test_SubstituteSecrets_When_ReferenceToSelf(t *testing.T) {

// 	var tests = []struct {
// 		Key           string
// 		Value         string
// 		ExpectedValue string
// 	}{
// 		{Key: "A", Value: "${A}", ExpectedValue: "${A}"},
// 		{Key: "A", Value: "${A} ${A}", ExpectedValue: "${A} ${A}"},
// 		{Key: "A", Value: "${A}${A}", ExpectedValue: "${A}${A}"},
// 	}

// 	for _, test := range tests {
// 		secret := models.SingleEnvironmentVariable{
// 			Key:   test.Key,
// 			Value: test.Value,
// 		}

// 		secrets := []models.SingleEnvironmentVariable{secret}
// 		result := SubstituteSecrets(secrets)

// 		if result[0].Value != test.ExpectedValue {
// 			t.Errorf("Test_SubstituteSecrets_When_ReferenceToSelf: expected %s but got %s for input %s", test.ExpectedValue, result[0].Value, test.Value)
// 		}

// 	}
// }

// func Test_SubstituteSecrets_When_ReferenceDoesNotExist(t *testing.T) {

// 	var tests = []struct {
// 		Key           string
// 		Value         string
// 		ExpectedValue string
// 	}{
// 		{Key: "A", Value: "${X}", ExpectedValue: "${X}"},
// 		{Key: "A", Value: "${H}HELLO", ExpectedValue: "${H}HELLO"},
// 		{Key: "A", Value: "${L}${S}", ExpectedValue: "${L}${S}"},
// 	}

// 	for _, test := range tests {
// 		secret := models.SingleEnvironmentVariable{
// 			Key:   test.Key,
// 			Value: test.Value,
// 		}

// 		secrets := []models.SingleEnvironmentVariable{secret}
// 		result := SubstituteSecrets(secrets)

// 		if result[0].Value != test.ExpectedValue {
// 			t.Errorf("Test_SubstituteSecrets_When_ReferenceToSelf: expected %s but got %s for input %s", test.ExpectedValue, result[0].Value, test.Value)
// 		}

// 	}
// }

func Test_SubstituteSecrets_When_ReferenceDoesNotExist_And_Self_Referencing(t *testing.T) {

	tests := []struct {
		Key           string
		Value         string
		ExpectedValue string
	}{
		{
			Key:           "A",
			Value:         "*${A}* ${X}",
			ExpectedValue: "*${A}*",
		},
		{
			Key:           "H",
			Value:         "${X} >>>",
			ExpectedValue: "*${A}*",
		},
		{
			Key:           "X",
			Value:         "DOMAIN",
			ExpectedValue: "DOMAIN",
		},
		{
			Key:           "P",
			Value:         "${X} === ${A} ${H}",
			ExpectedValue: "DOMAIN",
		},
		// {
		// 	Key:           "B",
		// 	Value:         "*${A}*TOKEN*${X}*",
		// 	ExpectedValue: "*${A}*TOKEN*DOMAIN*",
		// },
		// {
		// 	Key:           "C",
		// 	Value:         "*${A}* *${X}* *${B}* *${UNKNOWN}*",
		// 	ExpectedValue: "*${A}* *DOMAIN* **${A}*TOKEN*DOMAIN** *${UNKNOWN}*",
		// },
		// {
		// 	Key:           "W",
		// 	Value:         "*${W}* ${LOL $JK} *${C}* *${C}*",
		// 	ExpectedValue: "*${W}* ${LOL $JK} **${A}* *DOMAIN* **${A}*TOKEN*DOMAIN** *${UNKNOWN}** **${A}* *DOMAIN* **${A}*TOKEN*DOMAIN** *${UNKNOWN}**",
		// },
	}

	secrets := []models.SingleEnvironmentVariable{}
	for _, test := range tests {
		secrets = append(secrets, models.SingleEnvironmentVariable{Key: test.Key, Value: test.Value})
	}

	SubstituteSecrets(secrets)

	// if result[0].Value != test.ExpectedValue {
	// 	t.Errorf("Test_SubstituteSecrets_When_ReferenceToSelf: expected %s but got %s for input %s", test.ExpectedValue, result[0].Value, test.Value)
	// }

	// fmt.Println(result)
}
