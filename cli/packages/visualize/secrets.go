package visualize

import (
	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/models"
)

func PrintAllSecretDetails(secrets []models.SingleEnvironmentVariable) {
	rows := [][3]string{}
	for _, secret := range secrets {
		rows = append(rows, [...]string{secret.Key, secret.Value, secret.Type})
	}

	headers := [...]string{"SECRET NAME", "SECRET VALUE", "SECRET TYPE"}

	SecretsTable(headers, rows)
}

func PrintSecretFolders(folders []api.Folders) {
	rows := [][]string{}
	for _, folder := range folders {
		rows = append(rows, []string{folder.Name})
	}

	headers := []string{"FOLDER NAME(S)"}

	Table(headers, rows)
}
