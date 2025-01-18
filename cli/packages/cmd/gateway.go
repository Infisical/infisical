/*
Copyright (c) 2023 Infisical Inc.
*/
package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical-merge/packages/api"
	"github.com/Infisical/infisical-merge/packages/util"
	"github.com/go-resty/resty/v2"
	"github.com/google/uuid"
	infisicalSdk "github.com/infisical/go-sdk"
	"github.com/spf13/cobra"
)

func getRealIP(r *http.Request) string {
	// Order of headers to check for real IP
	headersOrder := []string{
		"cf-connecting-ip",         // Cloudflare
		"Cf-Pseudo-IPv4",           // Cloudflare
		"x-client-ip",              // Most common
		"x-envoy-external-address", // for envoy
		"x-forwarded-for",          // Mostly used by proxies
		"fastly-client-ip",
		"true-client-ip",     // Akamai and Cloudflare
		"x-real-ip",          // Nginx
		"x-cluser-client-ip", // Rackspace LB
		"forwarded-for",
		"x-forwarded",
		"forwarded",
		"x-appengine-user-ip", // GCP App Engine
	}

	// Check each header in order
	for _, header := range headersOrder {
		if ip := r.Header.Get(header); ip != "" {
			// If IP contains comma, take the first IP (client IP)
			if strings.Contains(ip, ",") {
				return strings.TrimSpace(strings.Split(ip, ",")[0])
			}
			return ip
		}
	}

	// If no headers found, get IP from RemoteAddr
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		// If RemoteAddr doesn't have a port, return as is, split host and port
		ip, _, err := net.SplitHostPort(r.RemoteAddr)

		if err != nil {
			return r.RemoteAddr
		}
		return ip
	}
	return ip
}

type TunnelRequest struct {
	Protocol string `json:"protocol"`
	Target   string `json:"target"`
}

type TunnelResponse struct {
	TunnelID   string `json:"tunnelId"`
	TunnelPort int    `json:"tunnelPort"`
}

type Tunnel struct {
	allowedIp string
	ID        string
	Protocol  string
	Target    string
	LocalPort int
	Created   time.Time
	listener  net.Listener
}

type TunnelManager struct {
	infisicalClient infisicalSdk.InfisicalClientInterface
	tunnels         map[string]*Tunnel
	portRange       portRange
	mu              sync.RWMutex
	logger          *log.Logger
}

type portRange struct {
	start int
	end   int
}

func NewTunnelManager(startPort, endPort int, infisicalClient infisicalSdk.InfisicalClientInterface) *TunnelManager {
	return &TunnelManager{
		infisicalClient: infisicalClient,
		tunnels:         make(map[string]*Tunnel),
		portRange: portRange{
			start: startPort,
			end:   endPort,
		},
		logger: log.New(log.Writer(), "[TUNNEL] ", log.LstdFlags),
	}
}

func (tm *TunnelManager) findAvailablePort() (int, error) {
	for port := tm.portRange.start; port <= tm.portRange.end; port++ {
		listener, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
		if err == nil {
			listener.Close()
			return port, nil
		}
	}
	return 0, fmt.Errorf("no available ports in range %d-%d", tm.portRange.start, tm.portRange.end)
}

func sanitizeHost(host string) string {
	// If host contains @, take everything after the last @
	if idx := strings.LastIndex(host, "@"); idx != -1 {
		return host[idx+1:]
	}
	return host
}

func (tm *TunnelManager) createTunnel(req TunnelRequest, creatorIpAddress string) (*TunnelResponse, error) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	port, err := tm.findAvailablePort()
	if err != nil {
		return nil, err
	}

	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return nil, fmt.Errorf("failed to create listener: %v", err)
	}

	tunnelID := uuid.New().String()
	tunnel := &Tunnel{
		allowedIp: creatorIpAddress,
		ID:        tunnelID,
		Protocol:  req.Protocol,
		Target:    req.Target,
		LocalPort: port,
		Created:   time.Now(),
		listener:  listener,
	}

	tm.tunnels[tunnelID] = tunnel

	go tm.handleTunnelConnections(tunnel)

	return &TunnelResponse{
		TunnelID:   tunnelID,
		TunnelPort: port,
	}, nil
}

func (tm *TunnelManager) handleTunnelConnections(tunnel *Tunnel) {
	defer func() {
		tm.mu.Lock()
		delete(tm.tunnels, tunnel.ID)
		tm.mu.Unlock()
		tunnel.listener.Close()
	}()

	for {
		clientConn, err := tunnel.listener.Accept()

		if err != nil {
			tm.logger.Printf("Error accepting connection: %v", err)
			return
		}

		go tm.handleConnection(tunnel, clientConn)
	}
}

func (tm *TunnelManager) handleConnection(tunnel *Tunnel, clientConn net.Conn) {
	defer clientConn.Close()

	clientIP, _, err := net.SplitHostPort(clientConn.RemoteAddr().String())
	if err != nil {
		tm.logger.Printf("Failed to get client IP: %v", err)
		return
	}

	if clientIP != tunnel.allowedIp {
		tm.logger.Printf("Unauthorized connection from %s", clientIP)
		return
	}

	targetHost := sanitizeHost(tunnel.Target)

	targetConn, err := net.Dial("tcp", targetHost)
	if err != nil {
		tm.logger.Printf("Failed to connect to target %s: %v", targetHost, err)
		return
	}
	defer targetConn.Close()

	tm.logger.Printf("New connection on tunnel %s: %s -> %s",
		tunnel.ID, clientConn.RemoteAddr(), targetHost)

	// Bidirectional copy, target -> client and client -> target
	errCh := make(chan error, 2)
	go func() {
		_, err := io.Copy(targetConn, clientConn)
		errCh <- err
	}()
	go func() {
		_, err := io.Copy(clientConn, targetConn)
		errCh <- err
	}()

	// Wait for either end to close
	err = <-errCh
	if err != nil && err != io.EOF {
		tm.logger.Printf("Connection error: %v", err)
	}
}

func (tm *TunnelManager) handleTunnelCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req TunnelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Target == "" {
		http.Error(w, "Missing target host or port", http.StatusBadRequest)
		return
	}

	resp, err := tm.createTunnel(req, getRealIP(r))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (tm *TunnelManager) handleTunnelList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	tm.mu.RLock()
	tunnels := make([]Tunnel, 0, len(tm.tunnels))
	for _, t := range tm.tunnels {
		tunnels = append(tunnels, *t)
	}
	tm.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tunnels)
}

var gatewayCmd = &cobra.Command{
	Use:                   "gateway",
	Short:                 "Used to manage your Infisical Gateway",
	DisableFlagsInUseLine: true,
	Example:               "infisical gateway",
	Args:                  cobra.NoArgs,
}

func startGateway(cmd *cobra.Command, args []string) {

	infisicalConfig, err := util.GetConfigFile()
	if err != nil {
		util.HandleError(fmt.Errorf("startGateway: unable to get config file because [err=%s]", err))
	}

	loginMethod, err := cmd.Flags().GetString("method")
	if err != nil {
		util.HandleError(err)
	}

	gatewayName, err := cmd.Flags().GetString("name")

	if err != nil {
		util.HandleError(err)
	}
	if gatewayName == "" {
		util.PrintErrorMessageAndExit("Gateway name is required to start the gateway. Use the --name flag to specify the gateway name.")
	}

	domain, err := cmd.Flags().GetString("domain")
	if err != nil {
		util.HandleError(err)
	}

	authMethodValid, strategy := util.IsAuthMethodValid(loginMethod, false)
	if !authMethodValid {
		util.PrintErrorMessageAndExit(fmt.Sprintf("Invalid login method: %s", loginMethod))
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel() // Cancel the context when the client is no longer needed

	infisicalClient := infisicalSdk.NewInfisicalClient(ctx, infisicalSdk.Config{
		SiteUrl: domain,
	})

	authStrategies := map[util.AuthStrategyType]func(cmd *cobra.Command, infisicalClient infisicalSdk.InfisicalClientInterface) (credential infisicalSdk.MachineIdentityCredential, e error){
		util.AuthStrategy.UNIVERSAL_AUTH:    handleUniversalAuthLogin,
		util.AuthStrategy.KUBERNETES_AUTH:   handleKubernetesAuthLogin,
		util.AuthStrategy.AZURE_AUTH:        handleAzureAuthLogin,
		util.AuthStrategy.GCP_ID_TOKEN_AUTH: handleGcpIdTokenAuthLogin,
		util.AuthStrategy.GCP_IAM_AUTH:      handleGcpIamAuthLogin,
		util.AuthStrategy.AWS_IAM_AUTH:      handleAwsIamAuthLogin,
		util.AuthStrategy.OIDC_AUTH:         handleOidcAuthLogin,
	}

	_, err = authStrategies[strategy](cmd, infisicalClient)

	if err != nil {
		util.HandleError(err)
	}

	accessToken := infisicalClient.Auth().GetAccessToken()
	httpClient := resty.New().SetAuthToken(accessToken)
	if infisicalConfig.Gateway.ID == "" {

		createdGateway, err := api.CallCreateGatewayV1(httpClient, api.CreateGatewayV1Request{
			Name: gatewayName,
		})

		if err != nil {
			util.HandleError(err)
		}

		infisicalConfig.Gateway.ID = createdGateway.Gateway.ID
		err = util.WriteConfigFile(&infisicalConfig)

		if err != nil {
			util.HandleError(err)
		}
	} else {
		res, err := api.CallGetGatewayV1(httpClient, api.GetGatewayV1Request{
			ID: infisicalConfig.Gateway.ID,
		})

		if err != nil {
			util.HandleError(err)
		}

		if res.Gateway.Name != gatewayName {
			fmt.Printf("Gateway name has been changed from %s to %s\nUpdating..\n\n", res.Gateway.Name, gatewayName)
			_, err := api.CallUpdateGatewayV1(httpClient, api.UpdateGatewayV1Request{
				ID:   infisicalConfig.Gateway.ID,
				Name: gatewayName,
			})

			if err != nil {
				util.HandleError(err)
			}
		}
	}

	tm := NewTunnelManager(10000, 20000, infisicalClient)

	authMiddleware := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			token := r.Header.Get("Authorization")
			if token == "" {
				http.Error(w, "Unauthorized: No token provided", http.StatusUnauthorized)
				return
			}

			token = strings.TrimPrefix(token, "Bearer ")

			httpClient := resty.New()
			httpClient.SetAuthScheme("Bearer")
			httpClient.SetAuthToken(token)

			_, err := api.CallListGatewaysV1(httpClient)

			if err != nil {
				http.Error(w, "Unauthorized: Invalid token", http.StatusUnauthorized)
				return
			}

			next(w, r)
		}
	}

	http.HandleFunc("/tunnel", authMiddleware(tm.handleTunnelCreate))
	http.HandleFunc("/tunnels", authMiddleware(tm.handleTunnelList))
	http.Handle("/health", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	serverPort := 8022
	tm.logger.Printf("Starting gateway server on port %d", serverPort)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", serverPort), nil); err != nil {
		tm.logger.Fatalf("Failed to start server: %v", err)
	}

}

var gatewayStartCmd = &cobra.Command{
	Example:               `gateway start`,
	Short:                 "Starts the Infisical Gateway",
	Use:                   "start",
	DisableFlagsInUseLine: true,
	Args:                  cobra.NoArgs,
	Run:                   startGateway,
}

func init() {
	rootCmd.AddCommand(gatewayCmd)

	gatewayCmd.AddCommand(gatewayStartCmd)

	gatewayStartCmd.Flags().String("name", "", "name of the gateway")
	gatewayStartCmd.Flags().String("method", "", "login method")
	gatewayStartCmd.Flags().String("client-id", "", "client id for universal auth")
	gatewayStartCmd.Flags().String("client-secret", "", "client secret for universal auth")
	gatewayStartCmd.Flags().String("machine-identity-id", "", "machine identity id for kubernetes, azure, gcp-id-token, gcp-iam, and aws-iam auth methods")
	gatewayStartCmd.Flags().String("service-account-token-path", "", "service account token path for kubernetes auth")
	gatewayStartCmd.Flags().String("service-account-key-file-path", "", "service account key file path for GCP IAM auth")
	gatewayStartCmd.Flags().String("oidc-jwt", "", "JWT for OIDC authentication")
}
