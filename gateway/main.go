package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
)

// TunnelRequest represents the handshake request
type TunnelRequest struct {
	GatewayToken string `json:"gatewayToken"`
	Protocol     string `json:"protocol"`
	TargetHost   string `json:"targetHost"`
	TargetPort   int    `json:"targetPort"`
}

// TunnelResponse is returned after successful handshake
type TunnelResponse struct {
	TunnelID   string `json:"tunnelId"`
	TunnelPort int    `json:"tunnelPort"`
}

// Tunnel represents an active tunnel
type Tunnel struct {
	ID         string
	Protocol   string
	TargetHost string
	TargetPort int
	LocalPort  int
	Created    time.Time
	listener   net.Listener
}

// TunnelManager handles tunnel lifecycle
type TunnelManager struct {
	tunnels   map[string]*Tunnel
	portRange portRange
	mu        sync.RWMutex
	logger    *log.Logger
}

type portRange struct {
	start int
	end   int
}

func NewTunnelManager(startPort, endPort int) *TunnelManager {
	return &TunnelManager{
		tunnels: make(map[string]*Tunnel),
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

func (tm *TunnelManager) createTunnel(req TunnelRequest) (*TunnelResponse, error) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	// Find available port
	port, err := tm.findAvailablePort()
	if err != nil {
		return nil, err
	}

	// Create listener for tunnel
	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return nil, fmt.Errorf("failed to create listener: %v", err)
	}

	tunnelID := uuid.New().String()
	tunnel := &Tunnel{
		ID:         tunnelID,
		Protocol:   req.Protocol,
		TargetHost: req.TargetHost,
		TargetPort: req.TargetPort,
		LocalPort:  port,
		Created:    time.Now(),
		listener:   listener,
	}

	tm.tunnels[tunnelID] = tunnel

	// Start handling connections
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

	targetConn, err := net.Dial("tcp", fmt.Sprintf("%s:%d", tunnel.TargetHost, tunnel.TargetPort))
	if err != nil {
		tm.logger.Printf("Failed to connect to target %s:%d: %v", tunnel.TargetHost, tunnel.TargetPort, err)
		return
	}
	defer targetConn.Close()

	tm.logger.Printf("New connection on tunnel %s: %s -> %s:%d",
		tunnel.ID, clientConn.RemoteAddr(), tunnel.TargetHost, tunnel.TargetPort)

	// Bidirectional copy
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

// HTTP handlers
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

	// Validate request
	if req.TargetHost == "" || req.TargetPort == 0 {
		http.Error(w, "Missing target host or port", http.StatusBadRequest)
		return
	}

	resp, err := tm.createTunnel(req)
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

func main() {
	tm := NewTunnelManager(10000, 20000) // Port range for tunnels

	// HTTP endpoints
	http.HandleFunc("/tunnel", tm.handleTunnelCreate)
	http.HandleFunc("/tunnels", tm.handleTunnelList)

	// Start HTTP server
	serverPort := 8022
	tm.logger.Printf("Starting gateway server on port %d", serverPort)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", serverPort), nil); err != nil {
		tm.logger.Fatalf("Failed to start server: %v", err)
	}
}
