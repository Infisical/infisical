package visualize

import (
	"os"
	"strings"

	"github.com/jedib0t/go-pretty/table"
	"github.com/mattn/go-isatty"
	"github.com/muesli/ansi"
	"github.com/muesli/reflow/truncate"
	"github.com/rs/zerolog/log"
	"golang.org/x/term"
)

type TableOptions struct {
	Title string
}

// func GetDefaultTableOptions() TableOptions{
// 	return TableOptions{
// 		Title: "",
// 	}
// }

const (
	// combined width of the table borders and padding
	borderWidths = 10
	// char to indicate that a string has been truncated
	ellipsis = "…"
)

// Given headers and rows, this function will print out a table
func Table(headers [3]string, rows [][3]string) {
	// if we're not in a terminal or cygwin terminal, don't truncate the secret value
	shouldTruncate := isatty.IsTerminal(os.Stdout.Fd())

	// This will return an error if we're not in a terminal or
	// if the terminal is a cygwin terminal like Git Bash.
	width, _, err := term.GetSize(int(os.Stdout.Fd()))
	if err != nil {
		if shouldTruncate {
			log.Error().Msgf("error getting terminal size: %s", err)
		} else {
			log.Debug().Err(err)
		}
	}

	longestSecretName, longestSecretType := getLongestValues(append(rows, headers))
	availableWidth := width - longestSecretName - longestSecretType - borderWidths
	if availableWidth < 0 {
		availableWidth = 0
	}

	t := table.NewWriter()
	t.SetOutputMirror(os.Stdout)
	t.SetStyle(table.StyleLight)

	// t.SetTitle(tableOptions.Title)
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
		for i, val := range row {
			// only truncate the first column (secret value)
			if i == 1 && stringWidth(val) > availableWidth && shouldTruncate {
				val = truncate.StringWithTail(val, uint(availableWidth), ellipsis)
			}
			tableRow = append(tableRow, val)
		}
		t.AppendRow(tableRow)
	}

	t.Render()
}

// getLongestValues returns the length of the longest secret name and type from all rows (including the header).
func getLongestValues(rows [][3]string) (longestSecretName, longestSecretType int) {
	for _, row := range rows {
		if len(row[0]) > longestSecretName {
			longestSecretName = stringWidth(row[0])
		}
		if len(row[2]) > longestSecretType {
			longestSecretType = stringWidth(row[2])
		}
	}
	return
}

// stringWidth returns the width of a string.
// ANSI escape sequences are ignored and double-width characters are handled correctly.
func stringWidth(str string) (width int) {
	for _, l := range strings.Split(str, "\n") {
		w := ansi.PrintableRuneWidth(l)
		if w > width {
			width = w
		}
	}
	return width
}
