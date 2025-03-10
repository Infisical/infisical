//go:build !windows
// +build !windows

package gateway

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net"
	"os"
	"os/signal"

	// "runtime"
	"strconv"
	"syscall"

	"github.com/Infisical/infisical-merge/packages/systemd"
	"github.com/pion/dtls/v3"
	"github.com/pion/logging"
	"github.com/pion/turn/v4"
	"github.com/rs/zerolog/log"
	"gopkg.in/yaml.v2"
)

var (
	errMissingTlsCert = errors.New("Missing TLS files")
)

type GatewayRelay struct {
	Config *GatewayRelayConfig
}

type GatewayRelayConfig struct {
	PublicIP          string `yaml:"public_ip"`
	Port              int    `yaml:"port"`
	Realm             string `yaml:"realm"`
	AuthSecret        string `yaml:"auth_secret"`
	RelayMinPort      uint16 `yaml:"relay_min_port"`
	RelayMaxPort      uint16 `yaml:"relay_max_port"`
	TlsCertPath       string `yaml:"tls_cert_path"`
	TlsPrivateKeyPath string `yaml:"tls_private_key_path"`
	TlsCaPath         string `yaml:"tls_ca_path"`

	tls          tls.Certificate
	tlsCa        string
	isTlsEnabled bool
}

func NewGatewayRelay(configFilePath string) (*GatewayRelay, error) {
	cfgFile, err := os.ReadFile(configFilePath)
	if err != nil {
		return nil, err
	}
	var cfg GatewayRelayConfig
	if err := yaml.Unmarshal(cfgFile, &cfg); err != nil {
		return nil, err
	}

	if cfg.PublicIP == "" {
		return nil, fmt.Errorf("Missing public ip")
	}

	if cfg.AuthSecret == "" {
		return nil, fmt.Errorf("Missing auth secret")
	}

	if cfg.Realm == "" {
		cfg.Realm = "infisical.org"
	}

	if cfg.RelayMinPort == 0 {
		cfg.RelayMinPort = 49152
	}

	if cfg.RelayMaxPort == 0 {
		cfg.RelayMaxPort = 65535
	}

	if cfg.Port == 0 {
		cfg.Port = 3478
	} else if cfg.Port == 5349 {
		if cfg.TlsCertPath == "" || cfg.TlsPrivateKeyPath == "" {
			return nil, errMissingTlsCert
		}

		cert, err := tls.LoadX509KeyPair(cfg.TlsCertPath, cfg.TlsPrivateKeyPath)
		if err != nil {
			return nil, fmt.Errorf("Failed to read load server tls key pair: %w", err)
		}

		if cfg.TlsCaPath != "" {
			ca, err := os.ReadFile(cfg.TlsCaPath)
			if err != nil {
				return nil, fmt.Errorf("Failed to read tls ca: %w", err)
			}
			cfg.tlsCa = string(ca)
		}

		cfg.tls = cert
		cfg.isTlsEnabled = true
	}

	return &GatewayRelay{
		Config: &cfg,
	}, nil
}

func (g *GatewayRelay) Run() error {
	addr, err := net.ResolveUDPAddr("udp", "0.0.0.0:"+strconv.Itoa(g.Config.Port))
	if err != nil {
		return fmt.Errorf("Failed to parse server address: %s", err)
	}

	// NewLongTermAuthHandler takes a pion.LeveledLogger. This allows you to intercept messages
	// and process them yourself.
	logger := logging.NewDefaultLeveledLoggerForScope("lt-creds", logging.LogLevelTrace, os.Stdout)

	publicIP := g.Config.PublicIP
	relayAddressGenerator := &turn.RelayAddressGeneratorPortRange{
		RelayAddress: net.ParseIP(publicIP), // Claim that we are listening on IP passed by user
		Address:      "0.0.0.0",             // But actually be listening on every interface
		MinPort:      g.Config.RelayMinPort,
		MaxPort:      g.Config.RelayMaxPort,
	}

	loggerF := logging.NewDefaultLoggerFactory()
	loggerF.DefaultLogLevel = logging.LogLevelDebug

	caCertPool := x509.NewCertPool()
	caCertPool.AppendCertsFromPEM([]byte(g.Config.tlsCa))

	listenerConfigs := make([]turn.ListenerConfig, 0)
	packetConfigs := make([]turn.PacketConnConfig, 0)

	if g.Config.isTlsEnabled {
		caCertPool := x509.NewCertPool()
		caCertPool.AppendCertsFromPEM([]byte(g.Config.tlsCa))
		dtlsServer, err := dtls.Listen("udp", addr, &dtls.Config{
			Certificates: []tls.Certificate{g.Config.tls},
			ClientCAs:    caCertPool,
		})
		if err != nil {
			return fmt.Errorf("Failed to start dtls server: %w", err)
		}
		listenerConfigs = append(listenerConfigs, turn.ListenerConfig{
			RelayAddressGenerator: relayAddressGenerator,
			Listener:              dtlsServer,
		})
	} else {
		udpListener, err := net.ListenPacket("udp4", "0.0.0.0:"+strconv.Itoa(g.Config.Port))
		if err != nil {
			return fmt.Errorf("Failed to relay udp listener: %w", err)
		}
		packetConfigs = append(packetConfigs, turn.PacketConnConfig{
			RelayAddressGenerator: relayAddressGenerator,
			PacketConn:            udpListener,
		})
	}

	server, err := turn.NewServer(turn.ServerConfig{
		Realm:       g.Config.Realm,
		AuthHandler: turn.LongTermTURNRESTAuthHandler(g.Config.AuthSecret, logger),
		// PacketConnConfigs is a list of UDP Listeners and the configuration around them
		ListenerConfigs:   listenerConfigs,
		PacketConnConfigs: packetConfigs,
		LoggerFactory:     loggerF,
	})

	if err != nil {
		return fmt.Errorf("Failed to start server: %w", err)
	}

	log.Info().Msgf("Relay listening on %d\n", g.Config.Port)

	// make this compatiable with systemd notify mode
	systemd.SdNotify(false, systemd.SdNotifyReady)
	// Block until user sends SIGINT or SIGTERM
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	<-sigs

	if err = server.Close(); err != nil {
		return fmt.Errorf("Failed to close server: %w", err)
	}
	return nil
}
