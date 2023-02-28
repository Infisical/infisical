package util

import (
	"io"
	"os"
	"path"
	"testing"

	"github.com/Infisical/infisical-merge/packages/models"
)

// References to self should return the value unaltered
func Test_SubstituteSecrets_When_ReferenceToSelf(t *testing.T) {

	var tests = []struct {
		Key           string
		Value         string
		ExpectedValue string
	}{
		{Key: "A", Value: "${A}", ExpectedValue: "${A}"},
		{Key: "A", Value: "${A} ${A}", ExpectedValue: "${A} ${A}"},
		{Key: "A", Value: "${A}${A}", ExpectedValue: "${A}${A}"},
	}

	for _, test := range tests {
		secret := models.SingleEnvironmentVariable{
			Key:   test.Key,
			Value: test.Value,
		}

		secrets := []models.SingleEnvironmentVariable{secret}
		result := SubstituteSecrets(secrets)

		if result[0].Value != test.ExpectedValue {
			t.Errorf("Test_SubstituteSecrets_When_ReferenceToSelf: expected %s but got %s for input %s", test.ExpectedValue, result[0].Value, test.Value)
		}

	}
}

func Test_SubstituteSecrets_When_ReferenceDoesNotExist(t *testing.T) {

	var tests = []struct {
		Key           string
		Value         string
		ExpectedValue string
	}{
		{Key: "A", Value: "${X}", ExpectedValue: "${X}"},
		{Key: "A", Value: "${H}HELLO", ExpectedValue: "${H}HELLO"},
		{Key: "A", Value: "${L}${S}", ExpectedValue: "${L}${S}"},
	}

	for _, test := range tests {
		secret := models.SingleEnvironmentVariable{
			Key:   test.Key,
			Value: test.Value,
		}

		secrets := []models.SingleEnvironmentVariable{secret}
		result := SubstituteSecrets(secrets)

		if result[0].Value != test.ExpectedValue {
			t.Errorf("Test_SubstituteSecrets_When_ReferenceToSelf: expected %s but got %s for input %s", test.ExpectedValue, result[0].Value, test.Value)
		}

	}
}

func Test_SubstituteSecrets_When_ReferenceDoesNotExist_And_Self_Referencing(t *testing.T) {

	tests := []struct {
		Key           string
		Value         string
		ExpectedValue string
	}{
		{
			Key:           "O",
			Value:         "${P} ==$$ ${X} ${UNKNOWN} ${A}",
			ExpectedValue: "DOMAIN === ${A} DOMAIN >>> ==$$ DOMAIN ${UNKNOWN} ${A}",
		},
		{
			Key:           "X",
			Value:         "DOMAIN",
			ExpectedValue: "DOMAIN",
		},
		{
			Key:           "A",
			Value:         "*${A}* ${X}",
			ExpectedValue: "*${A}* DOMAIN",
		},
		{
			Key:           "H",
			Value:         "${X} >>>",
			ExpectedValue: "DOMAIN >>>",
		},
		{
			Key:           "P",
			Value:         "DOMAIN === ${A} ${H}",
			ExpectedValue: "DOMAIN === ${A} DOMAIN >>>",
		},
		{
			Key:           "T",
			Value:         "${P} ==$$ ${X} ${UNKNOWN} ${A} ${P} ==$$ ${X} ${UNKNOWN} ${A}",
			ExpectedValue: "DOMAIN === ${A} DOMAIN >>> ==$$ DOMAIN ${UNKNOWN} ${A} DOMAIN === ${A} DOMAIN >>> ==$$ DOMAIN ${UNKNOWN} ${A}",
		},
		{
			Key:           "S",
			Value:         "${ SSS$$ ${HEY}",
			ExpectedValue: "${ SSS$$ ${HEY}",
		},
	}

	secrets := []models.SingleEnvironmentVariable{}
	for _, test := range tests {
		secrets = append(secrets, models.SingleEnvironmentVariable{Key: test.Key, Value: test.Value})
	}

	results := SubstituteSecrets(secrets)

	for index, expanded := range results {
		if expanded.Value != tests[index].ExpectedValue {
			t.Errorf("Test_SubstituteSecrets_When_ReferenceToSelf: expected [%s] but got [%s] for input [%s]", tests[index].ExpectedValue, expanded.Value, tests[index].Value)
		}
	}
}

func Test_SubstituteSecrets_When_No_SubstituteNeeded(t *testing.T) {

	tests := []struct {
		Key           string
		Value         string
		ExpectedValue string
	}{
		{
			Key:           "DOMAIN",
			Value:         "infisical.com",
			ExpectedValue: "infisical.com",
		},
		{
			Key:           "API_KEY",
			Value:         "hdgsvjshcgkdckhevdkd",
			ExpectedValue: "hdgsvjshcgkdckhevdkd",
		},
		{
			Key:           "ENV",
			Value:         "PROD",
			ExpectedValue: "PROD",
		},
	}

	secrets := []models.SingleEnvironmentVariable{}
	for _, test := range tests {
		secrets = append(secrets, models.SingleEnvironmentVariable{Key: test.Key, Value: test.Value})
	}

	results := SubstituteSecrets(secrets)

	for index, expanded := range results {
		if expanded.Value != tests[index].ExpectedValue {
			t.Errorf("Test_SubstituteSecrets_When_ReferenceToSelf: expected [%s] but got [%s] for input [%s]", tests[index].ExpectedValue, expanded.Value, tests[index].Value)
		}
	}
}

func Test_Read_Env_From_File(t *testing.T) {
	type testCase struct {
		TestFile    string
		ExpectedEnv string
	}

	var cases = []testCase{
		{
			TestFile:    "testdata/infisical-default-env.json",
			ExpectedEnv: "myDefaultEnv",
		},
		{
			TestFile:    "testdata/infisical-branch-env.json",
			ExpectedEnv: "myMainEnv",
		},
		{
			TestFile:    "testdata/infisical-no-matching-branch-env.json",
			ExpectedEnv: "myDefaultEnv",
		},
	}

	// create a tmp directory for testing
	testDir, err := os.MkdirTemp(os.TempDir(), "infisical-test")
	if err != nil {
		t.Errorf("Test_Read_DefaultEnv_From_File: Failed to create temp directory: %s", err)
	}

	// safe the current working directory
	originalDir, err := os.Getwd()
	if err != nil {
		t.Errorf("Test_Read_DefaultEnv_From_File: Failed to get current working directory: %s", err)
	}

	// backup the original git command
	originalGitCmd := getCurrentBranchCmd

	// make sure to clean up after the test
	t.Cleanup(func() {
		os.Chdir(originalDir)
		os.RemoveAll(testDir)
		getCurrentBranchCmd = originalGitCmd
	})

	// mock the git command to return "main" as the current branch
	getCurrentBranchCmd = execCmd{cmd: "echo", args: []string{"main"}}

	for _, c := range cases {
		// make sure we start in the original directory
		err = os.Chdir(originalDir)
		if err != nil {
			t.Errorf("Test_Read_DefaultEnv_From_File: Failed to change working directory: %s", err)
		}

		// remove old test file if it exists
		err = os.Remove(path.Join(testDir, INFISICAL_WORKSPACE_CONFIG_FILE_NAME))
		if err != nil && !os.IsNotExist(err) {
			t.Errorf("Test_Read_DefaultEnv_From_File: Failed to remove old test file: %s", err)
		}

		// deploy the test file
		copyTestFile(t, c.TestFile, path.Join(testDir, INFISICAL_WORKSPACE_CONFIG_FILE_NAME))

		// change the working directory to the tmp directory
		err = os.Chdir(testDir)
		if err != nil {
			t.Errorf("Test_Read_DefaultEnv_From_File: Failed to change working directory: %s", err)
		}

		// get env from file
		env := GetEnvFromWorkspaceFile()
		if env != c.ExpectedEnv {
			t.Errorf("Test_Read_DefaultEnv_From_File: Expected env to be %s but got %s", c.ExpectedEnv, env)
		}
	}
}

func copyTestFile(t *testing.T, src, dst string) {
	srcFile, err := os.Open(src)
	if err != nil {
		t.Errorf("Test_Read_Env_From_File_By_Branch: Failed to open source file: %s", err)
	}
	defer srcFile.Close()

	dstFile, err := os.Create(dst)
	if err != nil {
		t.Errorf("Test_Read_Env_From_File_By_Branch: Failed to create destination file: %s", err)
	}
	defer dstFile.Close()

	_, err = io.Copy(dstFile, srcFile)
	if err != nil {
		t.Errorf("Test_Read_Env_From_File_By_Branch: Failed to copy file: %s", err)
	}
}
