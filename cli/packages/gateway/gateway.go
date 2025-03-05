package gateway

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/systemd"
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
	logger := logging.NewDefaultLoggerFactory()
	if os.Getenv("LOG_LEVEL") == "debug" {
		logger.DefaultLogLevel = logging.LogLevelDebug
	}
	cfg := &turn.ClientConfig{
		STUNServerAddr: relayDetails.TurnServerAddress,
		TURNServerAddr: relayDetails.TurnServerAddress,
		Conn:           turn.NewSTUNConn(conn),
		Username:       relayDetails.TurnServerUsername,
		Password:       relayDetails.TurnServerPassword,
		Realm:          relayDetails.TurnServerRealm,
		LoggerFactory:  logger,
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

	errCh := make(chan error, 1)
	shutdownCh := make(chan bool, 1)

	if err = g.createPermissionForStaticIps(g.config.InfisicalStaticIp); err != nil {
		return err
	}

	g.registerHeartBeat(ctx, errCh)

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
		MaxIdleTimeout:  10 * time.Second,
		KeepAlivePeriod: 2 * time.Second,
	}

	g.registerRelayIsActive(ctx, relayUdpConnection.LocalAddr().String(), errCh)
	quicListener, err := quic.Listen(relayUdpConnection, tlsConfig, quicConfig)
	if err != nil {
		return fmt.Errorf("Failed to listen for QUIC: %w", err)
	}
	defer quicListener.Close()

	log.Printf("Listener started on %s", quicListener.Addr())

	log.Info().Msg("Gateway started successfully")

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

	// make this compatiable with systemd notify mode
	systemd.SdNotify(false, systemd.SdNotifyReady)
	select {
	case <-ctx.Done():
		log.Info().Msg("Shutting down gateway...")
	case err = <-errCh:
		log.Error().Err(err).Msg("Gateway error occurred")
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

func (g *Gateway) registerHeartBeat(ctx context.Context, errCh chan error) {
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()

	go func() {
		for {
			if err := api.CallGatewayHeartBeatV1(g.httpClient); err != nil {
				errCh <- err
			} else {
				log.Info().Msg("Gateway is reachable by Infisical")
			}

			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

func (g *Gateway) createPermissionForStaticIps(staticIps string) error {
	if staticIps == "" {
		return fmt.Errorf("Missing Infisical static ips for permission")
	}

	splittedIps := strings.Split(staticIps, ",")
	resolvedIps := make([]net.Addr, 0)
	for _, ip := range splittedIps {
		ip = strings.TrimSpace(ip)
		if ip == "" {
			continue
		}

		// if port not specific allow all port
		if !strings.Contains(ip, ":") {
			ip = ip + ":0"
		}

		peerAddr, err := net.ResolveUDPAddr("udp", ip)
		if err != nil {
			return fmt.Errorf("Failed to resolve static ip for permission: %w", err)
		}

		resolvedIps = append(resolvedIps, peerAddr)
	}

	if err := g.client.CreatePermission(resolvedIps...); err != nil {
		return fmt.Errorf("Failed to set ip permission: %w", err)
	}
	return nil
}

func (g *Gateway) registerRelayIsActive(ctx context.Context, relayAddress string, errCh chan error) error {
	ticker := time.NewTicker(10 * time.Second)
	maxFailures := 3
	failures := 0

	go func() {
		time.Sleep(2 * time.Second)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				// Configure TLS to skip verification
				tlsConfig := &tls.Config{
					InsecureSkipVerify: true,
					NextProtos:         []string{"infisical-gateway"},
				}
				quicConfig := &quic.Config{
					EnableDatagrams: true,
				}
				func() {
					checkCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
					defer cancel()
					conn, err := quic.DialAddr(checkCtx, relayAddress, tlsConfig, quicConfig)
					if err != nil {
						failures++
						log.Warn().Err(err).Int("failures", failures).Msg("Relay connection check failed")
						if failures >= maxFailures {
							errCh <- fmt.Errorf("relay connection check failed: %w", err)
						}
					}
					if conn != nil {
						conn.CloseWithError(0, "closed")
					}
				}()
			}
		}
	}()

	return nil
}
