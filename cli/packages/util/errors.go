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

	os.Exit(exitCode)
}

func PrintMessageAndExit(messages ...string) {
	if len(messages) > 0 {
		for _, message := range messages {
			fmt.Println(message)
		}
	}

	os.Exit(1)
}

func printError(e error) {
	color.Red("Hmm, we ran into an error: %v", e)
}
