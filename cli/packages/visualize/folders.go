package visualize

import "github.com/Infisical/infisical-merge/packages/models"

func PrintAllFoldersDetails(folders []models.SingleFolder, path string) {
	rows := [][3]string{}
	for _, folder := range folders {
		rows = append(rows, [...]string{folder.Name, path, folder.ID})
	}

	headers := [...]string{"FOLDER NAME", "PATH", "FOLDER ID"}

	Table(headers, rows)
}
