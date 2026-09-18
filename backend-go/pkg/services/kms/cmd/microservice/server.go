package main

import (
	"context"
	"crypto/subtle"
	"log/slog"
	"strings"
	"time"

	"github.com/infisical/api/internal/libs/requestid"
	"github.com/infisical/api/pkg/services/kms/config"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func newGRPCServer(cfg *config.Config) *grpc.Server {
	interceptors := []grpc.UnaryServerInterceptor{benchmarkTraceInterceptor()}

	if cfg.KMSAuthHeader != "" && cfg.KMSAuthSecret != "" {
		interceptors = append([]grpc.UnaryServerInterceptor{
			authUnaryServerInterceptor(cfg.KMSAuthHeader, cfg.KMSAuthSecret),
		}, interceptors...)
		serverOptions := []grpc.ServerOption{
			grpc.ChainUnaryInterceptor(interceptors...),
			grpc.StreamInterceptor(
				authStreamServerInterceptor(
					cfg.KMSAuthHeader,
					cfg.KMSAuthSecret,
				),
			),
		}
		return grpc.NewServer(serverOptions...)
	}

	return grpc.NewServer(grpc.ChainUnaryInterceptor(interceptors...))
}

// benchmarkTraceInterceptor emits duration only for explicitly sampled load-test
// requests. Normal production traffic never uses the bench-trace request-ID prefix.
func benchmarkTraceInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		md, _ := metadata.FromIncomingContext(ctx)
		reqIDs := md.Get("x-request-id")
		if len(reqIDs) != 1 || !(strings.HasPrefix(reqIDs[0], "bench-trace-") || strings.HasPrefix(reqIDs[0], "bench-raft-")) {
			return handler(ctx, req)
		}
		ctx = requestid.WithID(ctx, reqIDs[0])

		started := time.Now()
		response, err := handler(ctx, req)
		slog.InfoContext(ctx, "benchmark KMS request completed",
			slog.String("reqId", reqIDs[0]),
			slog.String("method", info.FullMethod),
			slog.String("duration", time.Since(started).String()),
			slog.Bool("success", err == nil),
		)
		return response, err
	}
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
