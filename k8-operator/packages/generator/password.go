package generator

import (
	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/sethvargo/go-password/password"
)

const (
	defaultLength      = 24
	defaultSymbolChars = "~!@#$%^&*()_+`-={}|[]\\:\"<>?,./"
	digitFactor        = 0.25
	symbolFactor       = 0.25
)

func generateSafePassword(
	passLen int,
	symbols int,
	symbolCharacters string,
	digits int,
	noUpper bool,
	allowRepeat bool,
) (string, error) {
	gen, err := password.NewGenerator(&password.GeneratorInput{
		Symbols: symbolCharacters,
	})
	if err != nil {
		return "", err
	}
	return gen.Generate(
		passLen,
		digits,
		symbols,
		noUpper,
		allowRepeat,
	)
}

func GeneratorPassword(spec v1alpha1.PasswordSpec) (string, error) {

	symbolCharacters := defaultSymbolChars

	if spec.SymbolCharacters != nil && *spec.SymbolCharacters != "" {
		symbolCharacters = *spec.SymbolCharacters
	}

	passwordLength := defaultLength

	if spec.Length != 0 {
		passwordLength = spec.Length
	}

	digits := int(float32(passwordLength) * digitFactor)
	if spec.Digits != nil {
		digits = *spec.Digits
	}

	symbols := int(float32(passwordLength) * symbolFactor)
	if spec.Symbols != nil {
		symbols = *spec.Symbols
	}

	pass, err := generateSafePassword(
		passwordLength,
		symbols,
		symbolCharacters,
		digits,
		spec.NoUpper,
		spec.AllowRepeat,
	)

	if err != nil {
		return "", err
	}

	return pass, nil
}
