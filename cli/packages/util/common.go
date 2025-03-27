package util

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/Infisical/infisical-merge/packages/config"
	"github.com/go-resty/resty/v2"
)

func GetHomeDir() (string, error) {
	directory, err := os.UserHomeDir()
	return directory, err
}

// write file to given path. If path does not exist throw error
func WriteToFile(fileName string, dataToWrite []byte, filePerm os.FileMode) error {
	err := os.WriteFile(fileName, dataToWrite, filePerm)
	if err != nil {
		return fmt.Errorf("unable to wrote to file [err=%v]", err)
	}

	return nil
}

func ValidateInfisicalAPIConnection() (ok bool) {
	_, err := http.Get(fmt.Sprintf("%v/status", config.INFISICAL_URL))
	return err == nil
}

func GetRestyClientWithCustomHeaders() (*resty.Client, error) {
	httpClient := resty.New()
	customHeaders := os.Getenv("INFISICAL_CUSTOM_HEADERS")
	if customHeaders != "" {
		headers := map[string]string{}
		pairs := strings.Split(customHeaders, " ")
		for _, pair := range pairs {
			kv := strings.SplitN(pair, "=", 2)
			if len(kv) != 2 {
				return nil, fmt.Errorf("invalid custom header format. Expected \"headerKey1=value1 headerKey2=value2 ....\" but got %v", customHeaders)
			}
			key := strings.TrimSpace(kv[0])
			value := strings.TrimSpace(kv[1])
			if !strings.EqualFold(key, "User-Agent") && !strings.EqualFold(key, "Accept") {
				headers[key] = value
			}
		}
		httpClient.SetHeaders(headers)
	}
	return httpClient, nil
}
