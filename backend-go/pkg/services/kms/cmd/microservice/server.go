package main

import (
	"context"
	"crypto/subtle"

	"github.com/infisical/api/pkg/services/kms/config"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func newGRPCServer(cfg *config.Config) *grpc.Server {
	var serverOptions []grpc.ServerOption

	if cfg.KMSAuthHeader != "" && cfg.KMSAuthSecret != "" {
		serverOptions = append(
			serverOptions,
			grpc.UnaryInterceptor(
				authUnaryServerInterceptor(
					cfg.KMSAuthHeader,
					cfg.KMSAuthSecret,
				),
			),
			grpc.StreamInterceptor(
				authStreamServerInterceptor(
					cfg.KMSAuthHeader,
					cfg.KMSAuthSecret,
				),
			),
		)
	}

	return grpc.NewServer(serverOptions...)
}

func validateAuthMetadata(
	ctx context.Context,
	headerName string,
	expectedSecret string,
) error {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return status.Error(
			codes.Unauthenticated,
			"missing request metadata",
		)
	}

	values := md.Get(headerName)
	if len(values) != 1 {
		return status.Error(
			codes.Unauthenticated,
			"missing or invalid authentication credentials",
		)
	}

	if subtle.ConstantTimeCompare(
		[]byte(values[0]),
		[]byte(expectedSecret),
	) != 1 {
		return status.Error(
			codes.Unauthenticated,
			"invalid authentication credentials",
		)
	}

	return nil
}

func authUnaryServerInterceptor(
	headerName string,
	expectedSecret string,
) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req any,
		_ *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (any, error) {
		if err := validateAuthMetadata(
			ctx,
			headerName,
			expectedSecret,
		); err != nil {
			return nil, err
		}

		return handler(ctx, req)
	}
}

func authStreamServerInterceptor(
	headerName string,
	expectedSecret string,
) grpc.StreamServerInterceptor {
	return func(
		srv any,
		ss grpc.ServerStream,
		_ *grpc.StreamServerInfo,
		handler grpc.StreamHandler,
	) error {
		if err := validateAuthMetadata(
			ss.Context(),
			headerName,
			expectedSecret,
		); err != nil {
			return err
		}

		return handler(srv, ss)
	}
}
