package appconnections_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

const roleArnMessage = "Role ARN must look like"

func awsAssumeRoleBody(t *testing.T, name, roleArn string) []byte {
	t.Helper()
	body := map[string]any{
		"method":      "assume-role",
		"credentials": map[string]string{"roleArn": roleArn},
	}
	if name != "" {
		body["name"] = name
	}
	raw, err := json.Marshal(body)
	require.NoError(t, err)
	return raw
}

func TestAWSAppConnection_RoleArn(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	malformed := map[string]string{
		"a short account ID":    "arn:aws:iam::12345:role/infisical",
		"a non-numeric account": "arn:aws:iam::12345678901a:role/infisical",
		"no role/ resource":     "arn:aws:iam::123456789012:user/infisical",
		"an empty role name":    "arn:aws:iam::123456789012:role/",
		"no arn prefix":         "123456789012:role/infisical",
	}
	for name, roleArn := range malformed {
		t.Run("should refuse create with a readable error when the Role ARN has "+name, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			body := awsAssumeRoleBody(t, "arn-"+id.Short(), roleArn)

			// Action
			res, err := tn.Admin.API.CreateAwsAppConnectionWithBodyWithResponse(t.Context(),
				"application/json", bytes.NewReader(body))

			// Assert
			require.NoError(t, err)
			require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
			require.Contains(t, string(res.Body), roleArnMessage)
		})
	}

	partitions := map[string]string{
		"commercial": "arn:aws:iam::123456789012:role/infisical",
		"GovCloud":   "arn:aws-us-gov:iam::123456789012:role/path/infisical",
		"China":      "arn:aws-cn:iam::123456789012:role/infisical",
		"EUSC":       "arn:aws-eusc:iam::123456789012:role/infisical",
		"custom":     "arn:aws-private-7:iam::123456789012:role/infisical",
	}
	for name, roleArn := range partitions {
		t.Run("should not refuse the Role ARN on create when the Partition is "+name, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			body := awsAssumeRoleBody(t, "arn-"+id.Short(), roleArn)

			// Action
			res, err := tn.Admin.API.CreateAwsAppConnectionWithBodyWithResponse(t.Context(),
				"application/json", bytes.NewReader(body))

			// Assert
			require.NoError(t, err)
			require.NotContains(t, string(res.Body), roleArnMessage)
		})
	}

	t.Run("should refuse update with a readable error and keep the connection when the Role ARN is malformed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		conn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
		body := awsAssumeRoleBody(t, "", "arn:aws:iam::123:role/infisical")

		// Action
		res, err := tn.Admin.API.UpdateAwsAppConnectionWithBodyWithResponse(t.Context(), conn.ID,
			"application/json", bytes.NewReader(body))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
		require.Contains(t, string(res.Body), roleArnMessage)
	})

	t.Run("should not refuse the Role ARN on update when the Partition is custom", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		conn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
		body := awsAssumeRoleBody(t, "", "arn:aws-private-7:iam::123456789012:role/infisical")

		// Action
		res, err := tn.Admin.API.UpdateAwsAppConnectionWithBodyWithResponse(t.Context(), conn.ID,
			"application/json", bytes.NewReader(body))

		// Assert
		require.NoError(t, err)
		require.NotContains(t, string(res.Body), roleArnMessage)
	})
}
