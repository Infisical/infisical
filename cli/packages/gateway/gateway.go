package gateway

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/go-resty/resty/v2"
	"github.com/pion/logging"
	"github.com/pion/turn/v4"
	"github.com/rs/zerolog/log"
)

type GatewayConfig struct {
	TurnServerUsername string
	TurnServerPassword string
	TurnServerAddress  string
	InfisicalStaticIp  string
	SerialNumber       string
	PrivateKey         string
	Certificate        string
	CertificateChain   string
}

type Gateway struct {
	httpClient *resty.Client
	config     *GatewayConfig
	client     *turn.Client
}

func NewGateway(identityToken string) (Gateway, error) {
	httpClient := resty.New()
	httpClient.SetAuthToken(identityToken)

	return Gateway{
		httpClient: httpClient,
		config:     &GatewayConfig{},
	}, nil
}

func (g *Gateway) ConnectWithRelay() error {
	relayDetails, err := api.CallRegisterGatewayIdentityV1(g.httpClient)
	if err != nil {
		return err
	}

	// Dial TURN Server
	conn, err := net.Dial("tcp", relayDetails.TurnServerAddress)
	if err != nil {
		return fmt.Errorf("Failed to connect with relay server: %w", err)
	}

	if tcpConn, ok := conn.(*net.TCPConn); ok {
		tcpConn.SetKeepAlive(true)
		tcpConn.SetKeepAlivePeriod(10 * time.Second)
		tcpConn.SetNoDelay(true)
	}

	// Start a new TURN Client and wrap our net.Conn in a STUNConn
	// This allows us to simulate datagram based communication over a net.Conn
	cfg := &turn.ClientConfig{
		STUNServerAddr: relayDetails.TurnServerAddress,
		TURNServerAddr: relayDetails.TurnServerAddress,
		Conn:           turn.NewSTUNConn(conn),
		Username:       relayDetails.TurnServerUsername,
		Password:       relayDetails.TurnServerPassword,
		Realm:          relayDetails.TurnServerRealm,
		LoggerFactory:  logging.NewDefaultLoggerFactory(),
	}

	client, err := turn.NewClient(cfg)
	if err != nil {
		return fmt.Errorf("Failed to create relay client: %w", err)
	}

	err = client.Listen()
	if err != nil {
		return fmt.Errorf("Failed to listen to relay server: %w", err)
	}

	g.config = &GatewayConfig{
		TurnServerUsername: relayDetails.TurnServerUsername,
		TurnServerPassword: relayDetails.TurnServerPassword,
		TurnServerAddress:  relayDetails.TurnServerAddress,
		InfisicalStaticIp:  relayDetails.InfisicalStaticIp,
	}
	// if port not specific allow all port
	if !strings.Contains(relayDetails.InfisicalStaticIp, ":") {
		g.config.InfisicalStaticIp = g.config.InfisicalStaticIp + ":0"
	}

	g.client = client
	return nil
}

func (g *Gateway) Listen() error {
	defer g.client.Close()
	// Allocate a relay socket on the TURN server. On success, it
	// will return a net.PacketConn which represents the remote
	// socket.
	relayNonTlsConn, err := g.client.AllocateTCP()
	if err != nil {
		return fmt.Errorf("Failed to allocate relay connection: %w", err)
	}
	defer func() {
		if closeErr := relayNonTlsConn.Close(); closeErr != nil {
			log.Error().Msgf("Failed to close connection: %s", closeErr)
		}
	}()

	peerAddr, err := net.ResolveTCPAddr("tcp", g.config.InfisicalStaticIp)
	if err != nil {
		return fmt.Errorf("Failed to parse infisical static ip: %w", err)
	}
	gatewayCert, err := api.CallExchangeRelayCertV1(g.httpClient, api.ExchangeRelayCertRequestV1{
		RelayAddress: relayNonTlsConn.Addr().String(),
	})
	if err != nil {
		return err
	}

	g.config.SerialNumber = gatewayCert.SerialNumber
	g.config.PrivateKey = gatewayCert.PrivateKey
	g.config.Certificate = gatewayCert.Certificate
	g.config.CertificateChain = gatewayCert.CertificateChain

	go func() {
		err := relayNonTlsConn.CreatePermissions(peerAddr)
		if err != nil {
			log.Error().Msgf("Failed to refresh permission: %s", err)
		}
		log.Printf("Created permission for incoming connections")
		ticker := time.NewTicker(2 * time.Minute) // Refresh before 5-min expiry
		for range ticker.C {
			err := relayNonTlsConn.CreatePermissions(peerAddr)
			if err != nil {
				log.Error().Msgf("Failed to refresh permission: %s", err)
			}
		}
	}()

	cert, err := tls.X509KeyPair([]byte(gatewayCert.Certificate), []byte(gatewayCert.PrivateKey))
	if err != nil {
		return fmt.Errorf("failed to parse cert: %s", err)
	}

	fmt.Println(relayNonTlsConn.Addr().String())
	caCertPool := x509.NewCertPool()
	caCertPool.AppendCertsFromPEM([]byte(gatewayCert.CertificateChain))

	relayConn := tls.NewListener(relayNonTlsConn, &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS12,
		ClientCAs:    caCertPool,
		ClientAuth:   tls.RequireAndVerifyClientCert,
	})

	for {
		log.Info().Msg("Connector started successfully")
		// Accept new relay connection
		conn, err := relayConn.Accept()
		if err != nil {
			log.Error().Msgf("Failed to accept connection: %v", err)
			continue
		}

		// Handle the connection in a goroutine
		go handleConnection(conn)
	}
}
