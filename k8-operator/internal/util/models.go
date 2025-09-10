package util

import (
	"context"

	"github.com/Infisical/infisical/k8-operator/internal/util/sse"
	infisicalSdk "github.com/infisical/go-sdk"
)

type ResourceVariables struct {
	InfisicalClient  infisicalSdk.InfisicalClientInterface
	CancelCtx        context.CancelFunc
	AuthDetails      AuthenticationDetails
	ServerSentEvents *sse.ConnectionRegistry
}
