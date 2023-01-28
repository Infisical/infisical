package util

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
)

func CheckForUpdate() {
	latestVersion, err := getLatestTag("Infisical", "infisical")
	if err != nil {
		// do nothing and continue
		return
	}
	if latestVersion != CLI_VERSION {
		PrintWarning(fmt.Sprintf("Please update your CLI. You are running version %s but the latest version is %s", CLI_VERSION, latestVersion))
	}
}

func getLatestTag(repoOwner string, repoName string) (string, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/tags", repoOwner, repoName)
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != 200 {
		return "", fmt.Sprintf("GitHub API returned status code %d", resp.StatusCode)
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

	return tags[0].Name, nil
}
