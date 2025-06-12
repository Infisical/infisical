package gateway

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/quic-go/quic-go"
	"github.com/rs/zerolog/log"
)

func handleConnection(ctx context.Context, quicConn quic.Connection) {
	log.Info().Msgf("New connection from: %s", quicConn.RemoteAddr().String())
	// Use WaitGroup to track all streams
	var wg sync.WaitGroup

	contextWithTimeout, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	for {
		// Accept the first stream, which we'll use for commands
		stream, err := quicConn.AcceptStream(contextWithTimeout)
		if err != nil {
			log.Printf("Failed to accept QUIC stream: %v", err)
			break
		}
		wg.Add(1)
		go func(stream quic.Stream) {
			defer wg.Done()
			defer stream.Close()

			handleStream(stream, quicConn)
		}(stream)
	}

	wg.Wait()
	log.Printf("All streams closed for connection: %s", quicConn.RemoteAddr().String())
}

func handleStream(stream quic.Stream, quicConn quic.Connection) {
	streamID := stream.StreamID()
	log.Printf("New stream %d from: %s", streamID, quicConn.RemoteAddr().String())

	// Use buffered reader for better handling of fragmented data
	reader := bufio.NewReader(stream)
	defer func() {
		log.Info().Msgf("Closing stream %d", streamID)
		if stream != nil {
			stream.Close()
		}
	}()

	for {
		msg, err := reader.ReadBytes('\n')
		if err != nil {
			if errors.Is(err, io.EOF) {
				return
			}
			log.Error().Msgf("Error reading command: %s", err)
			return
		}

		cmd := bytes.ToUpper(bytes.TrimSpace(bytes.Split(msg, []byte(" "))[0]))
		args := bytes.TrimSpace(bytes.TrimPrefix(msg, cmd))

		switch string(cmd) {
		case "FORWARD-TCP":
			proxyAddress := string(bytes.Split(args, []byte(" "))[0])
			destTarget, err := net.Dial("tcp", proxyAddress)
			if err != nil {
				log.Error().Msgf("Failed to connect to target: %v", err)
				return
			}
			defer destTarget.Close()
			log.Info().Msgf("Starting secure transmission between %s->%s", quicConn.LocalAddr().String(), destTarget.LocalAddr().String())

			// Handle buffered data
			buffered := reader.Buffered()
			if buffered > 0 {
				bufferedData := make([]byte, buffered)
				_, err := reader.Read(bufferedData)
				if err != nil {
					log.Error().Msgf("Error reading buffered data: %v", err)
					return
				}

				if _, err = destTarget.Write(bufferedData); err != nil {
					log.Error().Msgf("Error writing buffered data: %v", err)
					return
				}
			}

			CopyDataFromQuicToTcp(stream, destTarget)
			log.Info().Msgf("Ending secure transmission between %s->%s", quicConn.LocalAddr().String(), destTarget.LocalAddr().String())
			return

		case "FORWARD-HTTP":
			targetURL := ""
			argParts := bytes.Split(args, []byte(" "))

			if len(argParts) == 0 || len(argParts[0]) == 0 {
				log.Warn().Msg("FORWARD-HTTP used without a target URL.")
			} else {
				targetURL = string(argParts[0])
				if !isValidURL(targetURL) {
					log.Error().Msgf("Invalid target URL: %s", targetURL)
					return
				}
			}

			// Parse optional parameters
			var caCertB64, verifyParam string
			for _, part := range argParts[1:] {
				partStr := string(part)
				if strings.HasPrefix(partStr, "ca=") {
					caCertB64 = strings.TrimPrefix(partStr, "ca=")
				} else if strings.HasPrefix(partStr, "verify=") {
					verifyParam = strings.TrimPrefix(partStr, "verify=")
				}
			}

			log.Info().Msgf("Starting HTTP proxy to: %s", targetURL)

			if err := handleHTTPProxy(stream, reader, targetURL, caCertB64, verifyParam); err != nil {
				log.Error().Msgf("HTTP proxy error: %v", err)
			}
			return

		case "PING":
			if _, err := stream.Write([]byte("PONG\n")); err != nil {
				log.Error().Msgf("Error writing PONG response: %v", err)
			}
			return
		default:
			log.Error().Msgf("Unknown command: %s", string(cmd))
			return
		}
	}
}
func handleHTTPProxy(stream quic.Stream, reader *bufio.Reader, targetURL string, caCertB64 string, verifyParam string) error {
	transport := &http.Transport{
		DisableKeepAlives: false,
		MaxIdleConns:      10,
		IdleConnTimeout:   30 * time.Second,
	}

	if strings.HasPrefix(targetURL, "https://") {
		tlsConfig := &tls.Config{}

		if caCertB64 != "" {
			caCert, err := base64.StdEncoding.DecodeString(caCertB64)
			if err == nil {
				caCertPool := x509.NewCertPool()
				if caCertPool.AppendCertsFromPEM(caCert) {
					tlsConfig.RootCAs = caCertPool
					log.Info().Msg("Using provided CA certificate from gateway client")
				} else {
					log.Error().Msg("Failed to parse provided CA certificate")
				}
			} else {
				log.Error().Msgf("Failed to decode CA certificate: %v", err)
			}
		}

		if verifyParam != "" {
			tlsConfig.InsecureSkipVerify = verifyParam == "false"
			log.Info().Msgf("TLS verification set to: %s", verifyParam)
		}

		transport.TLSClientConfig = tlsConfig
	}

	// Loop to handle multiple HTTP requests on the same stream
	for {
		req, err := http.ReadRequest(reader)

		if err != nil {
			if errors.Is(err, io.EOF) {
				log.Info().Msg("Client closed HTTP connection")
				return nil
			}
			return fmt.Errorf("failed to read HTTP request: %v", err)
		}
		log.Info().Msgf("Received HTTP request: %s", req.URL.Path)

		actionHeader := HttpProxyAction(req.Header.Get(INFISICAL_HTTP_PROXY_ACTION_HEADER))
		if actionHeader != "" {
			if actionHeader == HttpProxyActionInjectGatewayK8sServiceAccountToken {
				token, err := os.ReadFile(KUBERNETES_SERVICE_ACCOUNT_TOKEN_PATH)
				if err != nil {
					stream.Write([]byte(buildHttpInternalServerError("failed to read k8s sa auth token")))
					continue // Continue to next request instead of returning
				}
				req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", string(token)))
				log.Info().Msgf("Injected gateway k8s SA auth token in request to %s", targetURL)
			} else if actionHeader == HttpProxyActionUseGatewayK8sServiceAccount { // will work without a target URL set
				// set the ca cert to the pod's k8s service account ca cert:
				caCert, err := os.ReadFile(KUBERNETES_SERVICE_ACCOUNT_CA_CERT_PATH)
				if err != nil {
					stream.Write([]byte(buildHttpInternalServerError("failed to read k8s sa ca cert")))
					continue
				}

				caCertPool := x509.NewCertPool()
				if ok := caCertPool.AppendCertsFromPEM(caCert); !ok {
					stream.Write([]byte(buildHttpInternalServerError("failed to parse k8s sa ca cert")))
					continue
				}

				transport.TLSClientConfig = &tls.Config{
					RootCAs: caCertPool,
				}

				// set authorization header to the pod's k8s service account token:
				token, err := os.ReadFile(KUBERNETES_SERVICE_ACCOUNT_TOKEN_PATH)
				if err != nil {
					stream.Write([]byte(buildHttpInternalServerError("failed to read k8s sa auth token")))
					continue
				}
				req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", string(token)))

				// update the target URL to point to the kubernetes API server:
				kubernetesServiceHost := os.Getenv(KUBERNETES_SERVICE_HOST_ENV_NAME)
				kubernetesServicePort := os.Getenv(KUBERNETES_SERVICE_PORT_HTTPS_ENV_NAME)

				fullBaseUrl := fmt.Sprintf("https://%s:%s", kubernetesServiceHost, kubernetesServicePort)
				targetURL = fullBaseUrl

				log.Info().Msgf("Redirected request to Kubernetes API server: %s", targetURL)
			}

			req.Header.Del(INFISICAL_HTTP_PROXY_ACTION_HEADER)
		}

		// Build full target URL
		var targetFullURL string
		if strings.HasPrefix(targetURL, "http://") || strings.HasPrefix(targetURL, "https://") {
			baseURL := strings.TrimSuffix(targetURL, "/")
			targetFullURL = baseURL + req.URL.Path
			if req.URL.RawQuery != "" {
				targetFullURL += "?" + req.URL.RawQuery
			}
		} else {
			baseURL := strings.TrimSuffix("http://"+targetURL, "/")
			targetFullURL = baseURL + req.URL.Path
			if req.URL.RawQuery != "" {
				targetFullURL += "?" + req.URL.RawQuery
			}
		}

		// create the request to the target
		proxyReq, err := http.NewRequest(req.Method, targetFullURL, req.Body)
		if err != nil {
			log.Error().Msgf("Failed to create proxy request: %v", err)
			stream.Write([]byte(buildHttpInternalServerError("failed to create proxy request")))
			continue // Continue to next request
		}
		proxyReq.Header = req.Header.Clone()

		log.Info().Msgf("Proxying %s %s to %s", req.Method, req.URL.Path, targetFullURL)

		client := &http.Client{
			Transport: transport,
			Timeout:   30 * time.Second,
		}

		resp, err := client.Do(proxyReq)
		if err != nil {
			log.Error().Msgf("Failed to reach target: %v", err)
			stream.Write([]byte(buildHttpInternalServerError(fmt.Sprintf("failed to reach target due to networking error: %s", err.Error()))))
			continue // Continue to next request
		}

		// Write the entire response (status line, headers, body) to the stream
		// http.Response.Write handles this for "Connection: close" correctly.
		// For other connection tokens, manual removal might be needed if they cause issues with QUIC.
		// For a simple proxy, this is generally sufficient.
		resp.Header.Del("Connection") // Good practice for proxies

		log.Info().Msgf("Writing response to stream: %s", resp.Status)

		if err := resp.Write(stream); err != nil {
			log.Error().Err(err).Msg("Failed to write response to stream")
			resp.Body.Close()
			return fmt.Errorf("failed to write response to stream: %w", err)
		}

		resp.Body.Close()

		// Check if client wants to close connection
		if req.Header.Get("Connection") == "close" {
			log.Info().Msg("Client requested connection close")
			return nil
		}
	}
}

func buildHttpInternalServerError(message string) string {
	return fmt.Sprintf("HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\n\r\n{\"message\": \"gateway: %s\"}", message)
}

type CloseWrite interface {
	CloseWrite() error
}

func isValidURL(str string) bool {
	u, err := url.Parse(str)
	return err == nil && u.Scheme != "" && u.Host != ""
}

func CopyDataFromQuicToTcp(quicStream quic.Stream, tcpConn net.Conn) {
	// Create a WaitGroup to wait for both copy operations
	var wg sync.WaitGroup
	wg.Add(2)

	// Start copying from QUIC stream to TCP
	go func() {
		defer wg.Done()
		if _, err := io.Copy(tcpConn, quicStream); err != nil {
			log.Error().Msgf("Error copying quic->postgres: %v", err)
		}

		if e, ok := tcpConn.(CloseWrite); ok {
			log.Debug().Msg("Closing TCP write end")
			e.CloseWrite()
		} else {
			log.Debug().Msg("TCP connection does not support CloseWrite")
		}
	}()

	// Start copying from TCP to QUIC stream
	go func() {
		defer wg.Done()
		if _, err := io.Copy(quicStream, tcpConn); err != nil {
			log.Debug().Msgf("Error copying postgres->quic: %v", err)
		}
		// Close the write side of the QUIC stream
		if err := quicStream.Close(); err != nil && !strings.Contains(err.Error(), "close called for canceled stream") {
			log.Error().Msgf("Error closing QUIC stream write: %v", err)
		}
	}()

	// Wait for both copies to complete
	wg.Wait()
}
