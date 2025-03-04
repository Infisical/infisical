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

	"github.com/quic-go/quic-go"
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
	relayAddress, relayPort := strings.Split(relayDetails.TurnServerAddress, ":")[0], strings.Split(relayDetails.TurnServerAddress, ":")[1]
	var conn net.Conn

	// Dial TURN Server
	if relayPort == "5349" {
		log.Info().Msgf("Provided relay port %s. Using TLS", relayPort)
		conn, err = tls.Dial("tcp", relayDetails.TurnServerAddress, &tls.Config{
			ServerName: relayAddress,
		})
	} else {
		log.Info().Msgf("Provided relay port %s. Using non TLS connection.", relayPort)
		peerAddr, errPeer := net.ResolveTCPAddr("tcp", relayDetails.TurnServerAddress)
		if errPeer != nil {
			return fmt.Errorf("Failed to parse turn server address: %w", err)
		}
		conn, err = net.DialTCP("tcp", nil, peerAddr)
	}

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
	if relayDetails.InfisicalStaticIp != "" && !strings.Contains(relayDetails.InfisicalStaticIp, ":") {
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
	relayUdpConnection, err := g.client.Allocate()
	if err != nil {
		return fmt.Errorf("Failed to allocate relay connection: %w", err)
	}

	log.Info().Msg(relayUdpConnection.LocalAddr().String())
	defer func() {
		if closeErr := relayUdpConnection.Close(); closeErr != nil {
			log.Error().Msgf("Failed to close connection: %s", closeErr)
		}
	}()

	gatewayCert, err := api.CallExchangeRelayCertV1(g.httpClient, api.ExchangeRelayCertRequestV1{
		RelayAddress: relayUdpConnection.LocalAddr().String(),
	})
	if err != nil {
		return err
	}

	g.config.SerialNumber = gatewayCert.SerialNumber
	g.config.PrivateKey = gatewayCert.PrivateKey
	g.config.Certificate = gatewayCert.Certificate
	g.config.CertificateChain = gatewayCert.CertificateChain

	shutdownCh := make(chan bool, 1)

	if g.config.InfisicalStaticIp != "" {
		log.Info().Msgf("Found static ip from Infisical: %s. Creating permission IP lifecycle", g.config.InfisicalStaticIp)
		peerAddr, err := net.ResolveUDPAddr("udp", g.config.InfisicalStaticIp)
		if err != nil {
			return fmt.Errorf("Failed to parse infisical static ip: %w", err)
		}
		err = g.client.CreatePermission(peerAddr)
		if err != nil {
			return fmt.Errorf("Failed to set permission: %w", err)
		}
	}

	cert, err := tls.X509KeyPair([]byte(gatewayCert.Certificate), []byte(gatewayCert.PrivateKey))
	if err != nil {
		return fmt.Errorf("failed to parse cert: %w", err)
	}

	caCertPool := x509.NewCertPool()
	caCertPool.AppendCertsFromPEM([]byte(gatewayCert.CertificateChain))

	// Setup QUIC server
	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS12,
		ClientCAs:    caCertPool,
		ClientAuth:   tls.RequireAndVerifyClientCert,
		NextProtos:   []string{"infisical-gateway"},
	}

	// Setup QUIC listener on the relayConn
	quicConfig := &quic.Config{
		EnableDatagrams: true,
		MaxIdleTimeout:  30 * time.Second,
		KeepAlivePeriod: 15 * time.Second,
	}

	quicListener, err := quic.Listen(relayUdpConnection, tlsConfig, quicConfig)
	if err != nil {
		return fmt.Errorf("Failed to listen for QUIC: %w", err)
	}
	defer quicListener.Close()

	log.Printf("Listener started on %s", quicListener.Addr())

	errCh := make(chan error, 1)
	log.Info().Msg("Gateway started successfully")
	g.registerHeartBeat(errCh, shutdownCh)
	g.registerRelayIsActive(relayUdpConnection.LocalAddr().String(), tlsConfig, quicConfig, errCh, shutdownCh)

	// Create a WaitGroup to track active connections
	var wg sync.WaitGroup

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-shutdownCh:
				return
			default:
				// Accept new relay connection
				quicConn, err := quicListener.Accept(context.Background())
				if err != nil {
					log.Printf("Failed to accept QUIC connection: %v", err)
					continue
				}

				tlsState := quicConn.ConnectionState().TLS
				if len(tlsState.PeerCertificates) > 0 {
					organizationUnit := tlsState.PeerCertificates[0].Subject.OrganizationalUnit
					commonName := tlsState.PeerCertificates[0].Subject.CommonName
					if organizationUnit[0] != "gateway-client" || commonName != "cloud" {
						errMsg := fmt.Sprintf("Client certificate verification failed. Received %s, %s", organizationUnit, commonName)
						log.Error().Msg(errMsg)
						quicConn.CloseWithError(1, errMsg)
						continue
					}
				}

				// Handle the connection in a goroutine
				wg.Add(1)
				go func(c quic.Connection) {
					defer wg.Done()
					defer c.CloseWithError(0, "connection closed")

					// Monitor parent context to close this connection when needed
					go func() {
						select {
						case <-ctx.Done():
							c.CloseWithError(0, "connection closed") // Force close connection when context is canceled
						case <-shutdownCh:
							c.CloseWithError(0, "connection closed") // Force close connection when accepting loop is done
						}
					}()

					handleConnection(ctx, c)
				}(quicConn)
			}
		}
	}()

	select {
	case <-ctx.Done():
		log.Info().Msg("Shutting down gateway...")
	case err = <-errCh:
	}

	// Signal the accept loop to stop
	close(shutdownCh)

	// Set a timeout for waiting on connections to close
	waitCh := make(chan struct{})
	go func() {
		wg.Wait()
		close(waitCh)
	}()

	select {
	case <-waitCh:
		// All connections closed normally
	case <-time.After(5 * time.Second):
		log.Warn().Msg("Timeout waiting for connections to close gracefully")
	}

	return err
}

func (g *Gateway) registerHeartBeat(errCh chan error, done chan bool) {
	ticker := time.NewTicker(30 * time.Minute)

	go func() {
		time.Sleep(10 * time.Second)
		log.Info().Msg("Registering first heart beat")
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
				log.Info().Msg("Registering heart beat")
				err := api.CallGatewayHeartBeatV1(g.httpClient)
				errCh <- err
			}
		}
	}()
}

func (g *Gateway) registerRelayIsActive(serverAddr string, tlsConf *tls.Config, quicConf *quic.Config, errCh chan error, done chan bool) {
	ticker := time.NewTicker(10 * time.Second)

	go func() {
		time.Sleep(5 * time.Second)
		for {
			select {
			case <-done:
				ticker.Stop()
				return
			case <-ticker.C:
				func() {
					ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second) // 3s handshake timeout
					defer cancel()
					conn, err := quic.DialAddr(ctx, serverAddr, tlsConf, quicConf)
					if conn != nil {
						conn.CloseWithError(0, "connection closed")
					}
					// this error means quic connection is alive
					if err != nil && !strings.Contains(err.Error(), "tls: failed to verify certificate") {
						errCh <- err
						return
					}
				}()
			}
		}
	}()
}
