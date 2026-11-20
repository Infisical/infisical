package aws

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSigV4_Signature(t *testing.T) {
	t.Run("should match AWS's published signature when given the get-vanilla request", func(t *testing.T) {
		// Setup: aws-sig-v4-test-suite/get-vanilla.
		req, err := http.NewRequest(http.MethodGet, "https://example.amazonaws.com/", nil)
		require.NoError(t, err)
		req.Host = "example.amazonaws.com"
		req.Header.Set("X-Amz-Date", "20150830T123600Z")
		cred := credential{
			accessKeyID:   "AKIDEXAMPLE",
			date:          "20150830",
			region:        "us-east-1",
			service:       "service",
			signedHeaders: []string{"host", "x-amz-date"},
		}

		// Action
		got, _ := signature(req, nil, cred, "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY")

		// Assert
		require.Equal(t, "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31", got)
	})
}
