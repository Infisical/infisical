package gateway

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"strings"
	"sync"
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

	turnServerAddr, err := net.ResolveTCPAddr("tcp", relayDetails.TurnServerAddress)
	if err != nil {
		return fmt.Errorf("Failed to resolve TURN server address: %w", err)
	}

	// Dial TURN Server
	conn, err := net.DialTCP("tcp", nil, turnServerAddr)
	if err != nil {
		return fmt.Errorf("Failed to connect with relay server: %w", err)
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

func (g *Gateway) Listen(ctx context.Context) error {
	defer g.client.Close()
	err := g.client.Listen()
	if err != nil {
		return fmt.Errorf("Failed to listen to relay server: %w", err)
	}

	log.Info().Msg("Connected with relay")
	// Allocate a relay socket on the TURN server. On success, it
	// will return a net.PacketConn which represents the remote
	// socket.
	relayNonTlsConn, err := g.client.AllocateTCP()
	if err != nil {
		return fmt.Errorf("Failed to allocate relay connection: %w", err)
	}

	log.Info().Msg(relayNonTlsConn.Addr().String())
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

	done := make(chan bool, 1)

	g.registerPermissionLifecycle(func() error {
		err := relayNonTlsConn.CreatePermissions(peerAddr)
		return err
	}, done)

	cert, err := tls.X509KeyPair([]byte(gatewayCert.Certificate), []byte(gatewayCert.PrivateKey))
	if err != nil {
		return fmt.Errorf("failed to parse cert: %s", err)
	}

	caCertPool := x509.NewCertPool()
	caCertPool.AppendCertsFromPEM([]byte(gatewayCert.CertificateChain))

	relayConn := tls.NewListener(relayNonTlsConn, &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS12,
		ClientCAs:    caCertPool,
		ClientAuth:   tls.RequireAndVerifyClientCert,
	})

	errCh := make(chan error, 1)
	log.Info().Msg("Connector started successfully")
	g.registerHeartBeat(errCh, done)
	g.registerRelayIsActive(relayNonTlsConn.Addr().String(), errCh, done)

	// Create a WaitGroup to track active connections
	var wg sync.WaitGroup

	go func() {
		for {
			select {
			case <-done:
				return
			default:
				// Accept new relay connection
				conn, err := relayConn.Accept()
				if err != nil {
					if !strings.Contains(err.Error(), "data contains incomplete STUN or TURN frame") {
						log.Error().Msgf("Failed to accept connection: %v", err)
					}
					continue
				}

				tlsConn, ok := conn.(*tls.Conn)
				if !ok {
					log.Error().Msg("Failed to convert to TLS connection")
					conn.Close()
					continue
				}

				err = tlsConn.Handshake()
				if err != nil {
					log.Error().Msgf("TLS handshake failed: %v", err)
					conn.Close()
					continue
				}

				// Get connection state which contains certificate information
				state := tlsConn.ConnectionState()
				if len(state.PeerCertificates) > 0 {
					organizationUnit := state.PeerCertificates[0].Subject.OrganizationalUnit
					commonName := state.PeerCertificates[0].Subject.CommonName
					if organizationUnit[0] != "gateway-client" && commonName != "cloud" {
						log.Error().Msgf("Client certificate verification failed. Received %s, %s", organizationUnit, commonName)
						continue
					}
				}

				// Handle the connection in a goroutine
				wg.Add(1)
				go func() {
					defer wg.Done()
					handleConnection(conn)
				}()
			}
		}
	}()

	var isShutdown bool
	select {
	case <-ctx.Done():
		log.Info().Msg("Shutting down gateway...")
		isShutdown = true
	case err = <-errCh:
	}

	// Signal the accept loop to stop
	close(done)
	wg.Wait()

	if isShutdown {
		log.Info().Msg("Gateway shutdown complete")
	}

	return err
}

func (g *Gateway) registerHeartBeat(errCh chan error, done chan bool) {
	ticker := time.NewTicker(1 * time.Hour)

	go func() {
		// wait for 5 mins
		time.Sleep(5 * time.Second)
		err := api.CallGatewayHeartBeatV1(g.httpClient)
		if err != nil {
			log.Error().Msgf("Failed to register heartbeat: %s", err)
		}

		for {
			select {
			case <-done:
				ticker.Stop()
				return
			case <-ticker.C:
				err := api.CallGatewayHeartBeatV1(g.httpClient)
				errCh <- err
			}
		}
	}()
}

func (g *Gateway) registerPermissionLifecycle(permissionFn func() error, done chan bool) {
	ticker := time.NewTicker(3 * time.Minute)

	go func() {
		// wait for 5 mins
		permissionFn()
		log.Printf("Ceated permission for incoming connections")
		for {
			select {
			case <-done:
				ticker.Stop()
				return
			case <-ticker.C:
				permissionFn()
			}
		}
	}()
}

func (g *Gateway) registerRelayIsActive(serverAddr string, errCh chan error, done chan bool) {
	ticker := time.NewTicker(10 * time.Second)

	go func() {
		time.Sleep(5 * time.Second)
		for {
			select {
			case <-done:
				ticker.Stop()
				return
			case <-ticker.C:
				conn, err := net.Dial("tcp", serverAddr)
				if err != nil {
					errCh <- err
					return
				}
				if conn != nil {
					conn.Close()
				}
			}
		}
	}()
}
