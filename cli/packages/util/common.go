package util

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"unicode"

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
		headers, err := GetInfisicalCustomHeadersMap()
		if err != nil {
			return nil, err
		}

		httpClient.SetHeaders(headers)
	}
	return httpClient, nil
}

func GetInfisicalCustomHeadersMap() (map[string]string, error) {
	customHeaders := os.Getenv("INFISICAL_CUSTOM_HEADERS")
	if customHeaders == "" {
		return nil, nil
	}

	headers := map[string]string{}

	pos := 0
	for pos < len(customHeaders) {
		for pos < len(customHeaders) && unicode.IsSpace(rune(customHeaders[pos])) {
			pos++
		}

		if pos >= len(customHeaders) {
			break
		}

		keyStart := pos
		for pos < len(customHeaders) && customHeaders[pos] != '=' && !unicode.IsSpace(rune(customHeaders[pos])) {
			pos++
		}

		if pos >= len(customHeaders) || customHeaders[pos] != '=' {
			return nil, fmt.Errorf("invalid custom header format. Expected \"headerKey1=value1 headerKey2=value2 ....\" but got %v", customHeaders)
		}

		key := customHeaders[keyStart:pos]
		pos++

		for pos < len(customHeaders) && unicode.IsSpace(rune(customHeaders[pos])) {
			pos++
		}

		var value string

		if pos < len(customHeaders) {
			if customHeaders[pos] == '"' || customHeaders[pos] == '\'' {
				quoteChar := customHeaders[pos]
				pos++
				valueStart := pos

				for pos < len(customHeaders) &&
					(customHeaders[pos] != quoteChar ||
						(pos > 0 && customHeaders[pos-1] == '\\')) {
					pos++
				}

				if pos < len(customHeaders) {
					value = customHeaders[valueStart:pos]
					pos++
				} else {
					value = customHeaders[valueStart:]
				}
			} else {
				valueStart := pos
				for pos < len(customHeaders) && !unicode.IsSpace(rune(customHeaders[pos])) {
					pos++
				}
				value = customHeaders[valueStart:pos]
			}
		}

		if key != "" && !strings.EqualFold(key, "User-Agent") && !strings.EqualFold(key, "Accept") {
			headers[key] = value
		}
	}

	return headers, nil
}
