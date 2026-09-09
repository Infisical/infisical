package kms

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"strconv"
	"strings"

	internalConfig "github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/ee/services/license"
	"github.com/infisical/api/internal/libs/requestid"
	"github.com/infisical/api/internal/server/api/platform/projects"

	"github.com/infisical/api/pkg/services/kms/db/store"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

type Service struct {
	Client     kmsproto.KMSServiceClient
	Conn       *grpc.ClientConn
	Permission projects.PermissionService
	License    *license.Service
	KmsStore   store.KMSStore
}

type Options struct {
	Permission projects.PermissionService
	KmsStore   store.KMSStore
	License    *license.Service
}

func NewKMSService(cfg *internalConfig.Config, opts Options) (*Service, error) {
	kmsServiceClient, conn, err := newKmsServiceClientFromConfig(cfg)
	if err != nil {
		return nil, err
	}

	return &Service{
		Client:     kmsServiceClient,
		Conn:       conn,
		Permission: opts.Permission,
		KmsStore:   opts.KmsStore,
		License:    opts.License,
	}, nil
}

type KMSClientOptions struct {
	TLSEnabled                                       bool
	CACertificate, ClientCert, ClientKey, ServerName string
	AuthHeader                                       string
	AuthSecret                                       string
}

func newKmsServiceClientFromConfig(cfg *internalConfig.Config) (kmsproto.KMSServiceClient, *grpc.ClientConn, error) {
	return newKmsServiceClient(cfg.KMSGRPCAddr, cfg.KMSGRPCPort, &KMSClientOptions{
		TLSEnabled: cfg.KMSGRPCTLSEnabled, CACertificate: cfg.KMSGRPCTLSCACert,
		ClientCert: cfg.KMSGRPCTLSClientCert, ClientKey: cfg.KMSGRPCTLSClientKey,
		ServerName: cfg.KMSGRPCTLSServerName,
		AuthHeader: cfg.KMSAuthHeader, AuthSecret: cfg.KMSAuthSecret,
	})
}

func newKmsServiceClient(addr string, port string, opts *KMSClientOptions) (kmsproto.KMSServiceClient, *grpc.ClientConn, error) {
	conn, err := newKmsServiceClientConn(addr, port, opts)
	if err != nil {
		return nil, nil, err
	}
	return kmsproto.NewKMSServiceClient(conn), conn, nil
}

func newKmsServiceClientConn(addr string, port string, opts *KMSClientOptions) (*grpc.ClientConn, error) {
	addr, port = strings.TrimSpace(addr), strings.TrimSpace(port)
	portNumber, err := strconv.Atoi(port)
	if addr == "" {
		return nil, fmt.Errorf("KMS_GRPC_ADDR must not be empty")
	}
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return nil, fmt.Errorf("KMS_GRPC_PORT must be a number between 1 and 65535 (got %q)", port)
	}

	transport, err := transportFromOptions(opts)
	if err != nil {
		return nil, err
	}
	var authInterceptors []grpc.DialOption

	if opts != nil && opts.AuthHeader != "" && opts.AuthSecret != "" {
		authInterceptors = append(
			authInterceptors,
			grpc.WithUnaryInterceptor(
				authInterceptor(opts.AuthHeader, opts.AuthSecret),
			),
			grpc.WithStreamInterceptor(
				authInterceptorForStream(opts.AuthHeader, opts.AuthSecret),
			),
		)
	}

	return grpc.NewClient(
		net.JoinHostPort(addr, strconv.Itoa(portNumber)),
		append(
			[]grpc.DialOption{
				grpc.WithTransportCredentials(*transport),
			},
			authInterceptors...,
		)...,
	)
}

func transportFromOptions(opts *KMSClientOptions) (*credentials.TransportCredentials, error) {
	var transport credentials.TransportCredentials
	if opts != nil && opts.TLSEnabled {
		o := opts
		tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12, ServerName: o.ServerName} //nolint:gosec // verification remains enabled
		if o.CACertificate != "" {
			roots := x509.NewCertPool()
			if !roots.AppendCertsFromPEM([]byte(o.CACertificate)) {
				return nil, fmt.Errorf("KMS_GRPC_TLS_CA_CERT does not contain a valid PEM certificate")
			}
			tlsConfig.RootCAs = roots
		}
		if o.ClientCert != "" || o.ClientKey != "" {
			if o.ClientCert == "" || o.ClientKey == "" {
				return nil, fmt.Errorf("KMS_GRPC_TLS_CLIENT_CERT and KMS_GRPC_TLS_CLIENT_KEY must be provided together")
			}
			cert, certErr := tls.X509KeyPair([]byte(o.ClientCert), []byte(o.ClientKey))
			if certErr != nil {
				return nil, fmt.Errorf("load KMS client certificate: %w", certErr)
			}
			tlsConfig.Certificates = []tls.Certificate{cert}
		}
		transport = credentials.NewTLS(tlsConfig)
	} else {
		transport = insecure.NewCredentials()
	}

	return &transport, nil
}

func authInterceptor(authHeader string, value string) grpc.UnaryClientInterceptor {
	return func(
		ctx context.Context,
		method string,
		req, reply any,
		cc *grpc.ClientConn,
		invoker grpc.UnaryInvoker,
		opts ...grpc.CallOption,
	) error {
		pairs := []string{authHeader, value}
		if reqID := requestid.FromContext(ctx); reqID != "" {
			pairs = append(pairs, requestid.Header, reqID)
		}
		ctx = metadata.AppendToOutgoingContext(ctx, pairs...)

		return invoker(ctx, method, req, reply, cc, opts...)
	}
}

func authInterceptorForStream(authHeader string, value string) grpc.StreamClientInterceptor {
	return func(
		ctx context.Context,
		desc *grpc.StreamDesc,
		cc *grpc.ClientConn,
		method string,
		streamer grpc.Streamer,
		opts ...grpc.CallOption,
	) (grpc.ClientStream, error) {
		ctx = metadata.AppendToOutgoingContext(
			ctx,
			authHeader, value,
		)

		return streamer(ctx, desc, cc, method, opts...)
	}
}

func (s *Service) Close() error {
	if s == nil || s.Conn == nil {
		return nil
	}

	err := s.Conn.Close()
	s.Conn = nil
	return err
}
