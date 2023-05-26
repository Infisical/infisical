/*
Copyright (c) 2023 Infisical Inc.
*/
package main

import (
	"os"

	"github.com/Infisical/infisical-merge/packages/cmd"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	cmd.Execute()
}
