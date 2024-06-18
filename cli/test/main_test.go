package tests

import (
	"fmt"
	"os"
	"testing"
)

func TestMain(m *testing.M) {
    // Setup
	fmt.Println("Setting up CLI...")
	SetupCli()
	fmt.Println("Performing user login...")
	UserLoginCmd()
	fmt.Println("Performing infisical init...")
	UserInitCmd()

    // Run the tests
    code := m.Run()

    // Exit
    os.Exit(code)
}
