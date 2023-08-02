/*
Copyright (c) 2023 Infisical Inc.
*/
package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/Infisical/infisical-merge/packages/cmd"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	log.Logger = log.Output(zerolog.ConsoleWriter{
		Out:             os.Stderr,
		FormatTimestamp: func(i interface{}) string { return "" },
		FormatLevel: func(i interface{}) string {
			levelStr, ok := i.(string)
			if !ok {
				return ""
			}

			levelStr = strings.ToUpper(levelStr)
			switch levelStr {
			case "TRACE":
				return fmt.Sprintf("\x1b[36m%s\x1b[0m", "trace:")
			case "DEBUG":
				return fmt.Sprintf("\x1b[34m%s\x1b[0m", "debug:")
			case "INFO":
				return ""
			case "WARN":
				return fmt.Sprintf("\x1b[33m%s\x1b[0m", "warning:")
			case "ERROR":
				return fmt.Sprintf("\x1b[31m%s\x1b[0m", "error:")
			case "FATAL":
				return fmt.Sprintf("\x1b[31;1m%s\x1b[0m", "fatal:")
			default:
				return levelStr
			}
		}})

	cmd.Execute()
}
