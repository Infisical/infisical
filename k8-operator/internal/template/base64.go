package template

import (
	"encoding/base64"
	"fmt"
)

func decodeBase64ToBytes(encodedString string) string {
	decoded, err := base64.StdEncoding.DecodeString(encodedString)
	if err != nil {
		panic(fmt.Sprintf("Error: %v", err))
	}
	return string(decoded)
}

func encodeBase64(plainString string) string {
	return base64.StdEncoding.EncodeToString([]byte(plainString))
}
