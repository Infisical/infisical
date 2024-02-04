package util

import (
	"fmt"
	"os"

	"github.com/fatih/color"
)

func HandleError(err error, messages ...string) {
	PrintErrorAndExit(1, err, messages...)
}

func PrintErrorAndExit(exitCode int, err error, messages ...string) {
	printError(err)

	if len(messages) > 0 {
		for _, message := range messages {
			fmt.Println(message)
		}
	}

	supportMsg := fmt.Sprintf("\n\nIf this issue continues, get support at https://infisical.com/slack")
	fmt.Fprintln(os.Stderr, supportMsg)

	os.Exit(exitCode)
}

func PrintWarning(message string) {
	color.New(color.FgYellow).Fprintf(os.Stderr, "Warning: %v \n", message)
}

func PrintSuccessMessage(message string) {
	color.New(color.FgGreen).Println(message)
}

func PrintErrorMessageAndExit(messages ...string) {
	if len(messages) > 0 {
		for _, message := range messages {
			fmt.Fprintln(os.Stderr, message)
		}
	}

	os.Exit(1)
}

func printError(e error) {
	color.New(color.FgRed).Fprintf(os.Stderr, "error: %v\n", e)
}
