/*
Copyright © 2022 NAME HERE <EMAIL ADDRESS>
*/
package main

import "github.com/Infisical/infisical/packages/cmd"

func main() {
	cmd.Execute()
}

func testLint() int {
	if true {
		return 1
	}

	testVar := 1

	return testVar

}
