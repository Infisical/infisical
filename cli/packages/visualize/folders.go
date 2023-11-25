package visualize

import "github.com/Infisical/infisical-merge/packages/models"

func PrintAllFoldersDetails(folders []models.SingleFolder) {
	rows := [][3]string{}
	for _, folder := range folders {
		rows = append(rows, [...]string{folder.ID, folder.Name, ""})
	}

	headers := [...]string{"FOLDER ID", "FOLDER NAME", "VERSION"}

	Table(headers, rows)
}
