package util

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"os/exec"
	"runtime"

	"github.com/fatih/color"
)

func CheckForUpdate() {
	latestVersion, err := getLatestTag("Infisical", "infisical")
	if err != nil {
		// do nothing and continue
		return
	}
	if latestVersion != CLI_VERSION {
		yellow := color.New(color.FgYellow).SprintFunc()
		blue := color.New(color.FgCyan).SprintFunc()
		black := color.New(color.FgBlack).SprintFunc()

		msg := fmt.Sprintf("%s %s %s %s",
			yellow("A new release of infisical is available:"),
			blue(CLI_VERSION),
			black("->"),
			blue(latestVersion),
		)

		fmt.Fprintln(os.Stderr, msg)

		updateInstructions := GetUpdateInstructions()

		if updateInstructions != "" {
			msg = fmt.Sprintf("\n%s\n", GetUpdateInstructions())
			fmt.Fprintln(os.Stderr, msg)
		}

	}
}

func getLatestTag(repoOwner string, repoName string) (string, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/tags", repoOwner, repoName)
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != 200 {
		return "", errors.New(fmt.Sprintf("gitHub API returned status code %d", resp.StatusCode))
	}

	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var tags []struct {
		Name string `json:"name"`
	}

	json.Unmarshal(body, &tags)

	return tags[0].Name[1:], nil
}

func GetUpdateInstructions() string {
	os := runtime.GOOS
	switch os {
	case "darwin":
		return "To update, run: brew update && brew upgrade infisical"
	case "windows":
		return "To update, run: scoop update infisical"
	case "linux":
		pkgManager := getLinuxPackageManager()
		switch pkgManager {
		case "apt-get":
			return "To update, run: sudo apt-get update && sudo apt-get install infisical"
		case "yum":
			return "To update, run: sudo yum update infisical"
		case "apk":
			return "To update, run: sudo apk update && sudo apk upgrade infisical"
		case "yay":
			return "To update, run: yay -Syu infisical"
		default:
			return ""
		}
	default:
		return ""
	}
}

func getLinuxPackageManager() string {
	cmd := exec.Command("apt-get", "--version")
	if err := cmd.Run(); err == nil {
		return "apt-get"
	}

	cmd = exec.Command("yum", "--version")
	if err := cmd.Run(); err == nil {
		return "yum"
	}

	cmd = exec.Command("yay", "--version")
	if err := cmd.Run(); err == nil {
		return "yay"
	}

	cmd = exec.Command("apk", "--version")
	if err := cmd.Run(); err == nil {
		return "apk"
	}

	return ""
}
