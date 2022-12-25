package visualize

import (
	"os"

	"github.com/jedib0t/go-pretty/table"
)

// Given headers and rows, this function will print out a table
func Table(headers []string, rows [][]string) {
	t := table.NewWriter()
	t.SetOutputMirror(os.Stdout)
	t.SetStyle(table.StyleLight)

	// t.SetTitle("Title")
	t.Style().Options.DrawBorder = true
	t.Style().Options.SeparateHeader = true
	t.Style().Options.SeparateColumns = true

	tableHeaders := table.Row{}
	for _, header := range headers {
		tableHeaders = append(tableHeaders, header)
	}

	t.AppendHeader(tableHeaders)
	for _, row := range rows {
		tableRow := table.Row{}
		for _, val := range row {
			tableRow = append(tableRow, val)
		}
		t.AppendRow(tableRow)
	}

	t.Render()
}
