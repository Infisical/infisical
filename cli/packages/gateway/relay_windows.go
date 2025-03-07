//go:build windows
// +build windows

package gateway

import (
	"errors"
)

var (
	errMissingTlsCert      = errors.New("Missing TLS files")
	errWindowsNotSupported = errors.New("Relay is not supported on Windows")
)

type GatewayRelay struct {
	Config *GatewayRelayConfig
}

type GatewayRelayConfig struct {
	PublicIP          string
	Port              int
	Realm             string
	AuthSecret        string
	RelayMinPort      uint16
	RelayMaxPort      uint16
	TlsCertPath       string
	TlsPrivateKeyPath string
	TlsCaPath         string
}

func NewGatewayRelay(configFilePath string) (*GatewayRelay, error) {
	return nil, errWindowsNotSupported
}

func (g *GatewayRelay) Run() error {
	return errWindowsNotSupported
}
