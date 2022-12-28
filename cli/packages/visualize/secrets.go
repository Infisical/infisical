package visualize

import "github.com/Infisical/infisical-merge/packages/models"

func PrintAllSecretDetails(secrets []models.SingleEnvironmentVariable) {
	rows := [][]string{}
	for _, secret := range secrets {
		rows = append(rows, []string{secret.Key, secret.Value, secret.Type})
	}

	headers := []string{"Secret name", "Secret vaule", "Secret type"}

	Table(headers, rows)
}
