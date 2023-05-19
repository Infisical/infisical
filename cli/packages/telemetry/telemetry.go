package telemetry

import (
	"os"

	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/denisbrodbeck/machineid"
	"github.com/posthog/posthog-go"
)

type Telemetry struct {
	isEnabled     bool
	posthogClient posthog.Client
}

func NewTelemetry(telemetryIsEnabled bool) *Telemetry {
	posthogAPIKey := os.Getenv("POSTHOG_API_KEY_FOR_CLI")
	if posthogAPIKey != "" {
		client, _ := posthog.NewWithConfig(
			posthogAPIKey,
			posthog.Config{},
		)

		return &Telemetry{isEnabled: telemetryIsEnabled, posthogClient: client}
	} else {
		return &Telemetry{isEnabled: false}
	}
}

func (t *Telemetry) CaptureEvent(eventName string, properties posthog.Properties) {
	userIdentity, err := t.GetDistinctId()
	if err != nil {
		return
	}

	if t.isEnabled {
		t.posthogClient.Enqueue(posthog.Capture{
			DistinctId: userIdentity,
			Event:      eventName,
			Properties: properties,
		})

		defer t.posthogClient.Close()
	}
}

func (t *Telemetry) GetDistinctId() (string, error) {
	var distinctId string
	var outputErr error

	machineId, err := machineid.ID()
	if err != nil {
		outputErr = err
	}

	userDetails, err := util.GetCurrentLoggedInUserDetails()
	if err != nil {
		outputErr = err
	}

	if userDetails.IsUserLoggedIn && userDetails.UserCredentials.Email != "" {
		distinctId = userDetails.UserCredentials.Email
	} else if machineId != "" {
		distinctId = "anonymous_cli_" + machineId
	} else {
		distinctId = ""
	}

	return distinctId, outputErr
}
