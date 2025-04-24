package util

import (
	"context"

	infisicalSdk "github.com/infisical/go-sdk"
)

type ResourceVariables struct {
	InfisicalClient infisicalSdk.InfisicalClientInterface
	CancelCtx       context.CancelFunc
	AuthDetails     AuthenticationDetails
}
