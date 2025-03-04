package gateway

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"syscall"

	"github.com/pion/logging"
	"github.com/pion/turn/v4"
	"github.com/rs/zerolog/log"
	"golang.org/x/sys/unix"
	"gopkg.in/yaml.v2"
)

var (
	errMissingTlsCert = errors.New("Missing TLS files")
)

type GatewayRelay struct {
	Config *GatewayRelayConfig
}

type GatewayRelayConfig struct {
	PublicIP          string `json:"public_ip"`
	Port              int    `json:"port"`
	Realm             string `json:"realm"`
	AuthSecret        string `json:"auth_secret"`
	RelayMinPort      uint16 `json:"relay_min_port"`
	RelayMaxPort      uint16 `json:"relay_max_port"`
	TlsCertPath       string `json:"tls_cert_path"`
	TlsPrivateKeyPath string `json:"tls_private_key_path"`

	tls          tls.Certificate
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

		tlsCertFile, err := os.ReadFile(cfg.TlsCertPath)
		if err != nil {
			return nil, err
		}
		tlsPrivateKeyFile, err := os.ReadFile(cfg.TlsPrivateKeyPath)
		if err != nil {
			return nil, err
		}

		cert, err := tls.LoadX509KeyPair(string(tlsCertFile), string(tlsPrivateKeyFile))
		if err != nil {
			return nil, err
		}
		cfg.tls = cert
		cfg.isTlsEnabled = true
	}

	return &GatewayRelay{
		Config: &cfg,
	}, nil
}

func (g *GatewayRelay) Run() error {
	addr, err := net.ResolveTCPAddr("tcp", "0.0.0.0:"+strconv.Itoa(g.Config.Port))
	if err != nil {
		return fmt.Errorf("Failed to parse server address: %s", err)
	}

	// NewLongTermAuthHandler takes a pion.LeveledLogger. This allows you to intercept messages
	// and process them yourself.
	logger := logging.NewDefaultLeveledLoggerForScope("lt-creds", logging.LogLevelTrace, os.Stdout)

	// Create `numThreads` UDP listeners to pass into pion/turn
	// pion/turn itself doesn't allocate any UDP sockets, but lets the user pass them in
	// this allows us to add logging, storage or modify inbound/outbound traffic
	// UDP listeners share the same local address:port with setting SO_REUSEPORT and the kernel
	// will load-balance received packets per the IP 5-tuple
	listenerConfig := &net.ListenConfig{
		Control: func(network, address string, conn syscall.RawConn) error { // nolint: revive
			var operr error
			if err = conn.Control(func(fd uintptr) {
				operr = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, unix.SO_REUSEPORT, 1)
			}); err != nil {
				return err
			}

			return operr
		},
	}

	publicIP := g.Config.PublicIP
	relayAddressGenerator := &turn.RelayAddressGeneratorPortRange{
		RelayAddress: net.ParseIP(publicIP), // Claim that we are listening on IP passed by user
		Address:      "0.0.0.0",             // But actually be listening on every interface
		MinPort:      g.Config.RelayMinPort,
		MaxPort:      g.Config.RelayMaxPort,
	}

	threadNum := runtime.NumCPU()
	listenerConfigs := make([]turn.ListenerConfig, threadNum)
	for i := 0; i < threadNum; i++ {
		conn, listErr := listenerConfig.Listen(context.Background(), addr.Network(), addr.String())
		if listErr != nil {
			return fmt.Errorf("Failed to allocate TCP listener at %s:%s %s", addr.Network(), addr.String(), listErr)
		}

		listenerConfigs[i] = turn.ListenerConfig{
			RelayAddressGenerator: relayAddressGenerator,
		}

		if g.Config.isTlsEnabled {
			listenerConfigs[i].Listener = tls.NewListener(conn, &tls.Config{
				Certificates: []tls.Certificate{g.Config.tls},
			})
		} else {
			listenerConfigs[i].Listener = conn
		}

		log.Printf("Server %d listening on %s\n", i, conn.Addr().String())
	}

	loggerF := logging.NewDefaultLoggerFactory()
	loggerF.DefaultLogLevel = logging.LogLevelDebug

	server, err := turn.NewServer(turn.ServerConfig{
		Realm:       g.Config.Realm,
		AuthHandler: turn.LongTermTURNRESTAuthHandler(g.Config.AuthSecret, logger),
		// PacketConnConfigs is a list of UDP Listeners and the configuration around them
		ListenerConfigs: listenerConfigs,
		LoggerFactory:   loggerF,
	})

	if err != nil {
		return fmt.Errorf("Failed to start server: %w", err)
	}

	// Block until user sends SIGINT or SIGTERM
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	<-sigs

	if err = server.Close(); err != nil {
		return fmt.Errorf("Failed to close server: %w", err)
	}
	return nil
}
