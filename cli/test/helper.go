package tests

type Secret struct {
	Key   string
	Value string
}

func Map[T, U any](ts []T, f func(T) U) []U {
	us := make([]U, len(ts))
	for i := range ts {
		us[i] = f(ts[i])
	}
	return us
}

func getSecretKeysAndValues(secrets []Secret) (keys []string, values []string) {
	secretKeys := []string{}
	secretValues := []string{}

	for _, secret := range secrets {
		secretKeys = append(secretKeys, secret.Key)
		secretValues = append(secretValues, secret.Value)
	}

	return secretKeys, secretValues
}
