package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/redis/go-redis/v9"

	"github.com/infisical/api/internal/ee/services/externalkms"
	"github.com/infisical/api/internal/ee/services/hsm"
	"github.com/infisical/api/internal/ee/services/license"
	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/libs/logutil"
	"github.com/infisical/api/pkg/services/kms"
	"github.com/infisical/api/pkg/services/kms/config"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"

	internalConfig "github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
	redisdb "github.com/infisical/api/internal/database/redis"
	"github.com/infisical/api/internal/libs/bootstrap"
)

func main() {

	// Setup structured JSON logger with context enrichment (e.g. request ID).
	logger := slog.New(logutil.NewContextHandler(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: config.GetConfiguredSlogLevel(),
	}))).With(slog.String("from", "go-sidecar"))
	slog.SetDefault(logger)

	// Load configuration through the environment loader.
	cfg, err := config.LoadConfig()
	if err != nil {
		var validationErr *internalConfig.ValidationError
		if errors.As(err, &validationErr) {
			logger.ErrorContext(context.Background(), "invalid environment variables")
			for _, issue := range validationErr.Issues {
				logger.ErrorContext(context.Background(), "  "+issue)
			}
		} else {
			logger.ErrorContext(context.Background(), "failed to load config", slog.Any("error", err))
		}
		os.Exit(1)
	}

	if err := start(cfg); err != nil {
		logger.ErrorContext(context.Background(), "failed to start KMS service", slog.Any("error", err))
		os.Exit(1)
	}

}

func newRedisFromConfig(cfg *config.Config) (redis.UniversalClient, error) {
	return redisdb.NewClient(redisdb.ConnectionOptions{
		RedisURL:                                cfg.RedisURL,
		RedisUsername:                           cfg.RedisUsername,
		RedisPassword:                           cfg.RedisPassword,
		RedisSentinelHosts:                      cfg.RedisSentinelHosts,
		RedisSentinelMasterName:                 cfg.RedisSentinelMasterName,
		RedisSentinelEnableTLS:                  cfg.RedisSentinelEnableTLS,
		RedisSentinelUsername:                   cfg.RedisSentinelUsername,
		RedisSentinelPassword:                   cfg.RedisSentinelPassword,
		RedisClusterHosts:                       cfg.RedisClusterHosts,
		RedisClusterEnableTLS:                   cfg.RedisClusterEnableTLS,
		RedisClusterAWSElastiCacheDNSLookupMode: cfg.RedisClusterAWSElastiCacheDNSLookupMode,
		RedisReadReplicas:                       cfg.RedisReadReplicas,
		ParsedRedisSentinelHosts:                cfg.ParsedRedisSentinelHosts,
		ParsedRedisClusterHosts:                 cfg.ParsedRedisClusterHosts,
		ParsedRedisReadReplicas:                 cfg.ParsedRedisReadReplicas,
	})
}

func newLicense(ctx context.Context, cfg *config.Config, ks keystore.KeyStore, db pg.DB) *license.Service {
	return license.NewService(ctx, &license.Options{
		LicenseServerURL:  cfg.LicenseServerURL,
		LicenseServerKey:  cfg.LicenseServerKey,
		LicenseKey:        cfg.LicenseKey,
		LicenseKeyOffline: cfg.LicenseKeyOffline,
		KeyStore:          ks,
		DB:                db,
		Logger:            slog.Default(),
	})
}

func newHSM(
	cfg *config.Config,
	licenseSvc *license.Service,
) (*hsm.Service, error) {
	if !cfg.IsHsmConfigured {
		return nil, nil
	}

	hsmSvc, err := hsm.NewService(hsm.Config{
		LibPath:  cfg.HSMLibPath,
		Slot:     cfg.HSMSlot,
		Pin:      cfg.HSMPin,
		KeyLabel: cfg.HSMKeyLabel,
	})
	if err != nil {
		return nil, fmt.Errorf("initialize HSM: %w", err)
	}

	features := licenseSvc.GetOnPremFeatures()

	if err := hsmSvc.StartService(features.HSM); err != nil {
		_ = hsmSvc.Close()
		return nil, fmt.Errorf("start HSM service: %w", err)
	}

	return hsmSvc, nil
}

func newKMS(
	ctx context.Context,
	cfg *config.Config,
	db pg.DB,
	hsmSvc *hsm.Service,
	externalKmsSvc *externalkms.Service,
) (*kms.Service, error) {
	kmsSvc, err := kms.New(ctx, &kms.Options{
		EncryptionKey:     cfg.EncryptionKey,
		RootEncryptionKey: cfg.RootEncryptionKey,
		FipsEnabled:       cfg.FipsEnabled,
		DB:                db,
		HSM:               hsmSvc,
		ExternalKms:       externalKmsSvc,
	})
	if err != nil {
		return nil, fmt.Errorf("initialize KMS: %w", err)
	}

	if err := kmsSvc.Init(ctx, cfg.IsHsmConfigured); err != nil {
		kmsSvc.Close()
		return nil, fmt.Errorf("initialize KMS service: %w", err)
	}

	return kmsSvc, nil
}

func start(cfg *config.Config) error {
	ctx := context.Background()
	logger := slog.Default()

	// Connect to Postgres
	db, err := pg.NewPostgresDB(ctx, cfg.DBConnectionURI, cfg.DBRootCert, cfg.DBReadReplicas)
	if err != nil {
		logger.ErrorContext(ctx, "failed to initialize database", slog.Any("error", err))
		return err
	}
	defer db.Close()

	// Validate connection
	dbReport := bootstrap.CheckDBConnection(ctx, db)
	dbReport.PrintReport(logger)

	// Connect to Redis.
	redisClient, err := newRedisFromConfig(cfg)
	if err != nil {
		logger.ErrorContext(ctx, "failed to initialize redis", slog.Any("error", err))
		return err
	}
	defer errutil.DeferErr(ctx, redisClient.Close, "closing redis")

	// Initialize KeyStore
	ks := keystore.NewKeyStore(redisClient)

	// Initialize License service early (needed for HSM license check).
	licenseSvc := newLicense(ctx, cfg, ks, db)
	defer licenseSvc.Close()

	// Initialize HSM if configured.
	hsmSvc, err := newHSM(cfg, licenseSvc)
	if err != nil {
		return err
	}
	if hsmSvc != nil {
		defer errutil.DeferErr(ctx, hsmSvc.Close, "closing HSM")
		logger.InfoContext(ctx, "HSM service started")
	}

	externalKmsSvc, err := externalkms.NewService(ctx, logger, &externalkms.Deps{})
	if err != nil {
		return fmt.Errorf("external kms: %w", err)
	}

	kmsSvc, err := newKMS(
		ctx,
		cfg,
		db,
		hsmSvc,
		externalKmsSvc,
	)
	if err != nil {
		return err
	}
	defer kmsSvc.Close()

	listener, err := net.Listen("tcp", cfg.Addr())
	if err != nil {
		return fmt.Errorf("listen for gRPC on %s: %w", cfg.Addr(), err)
	}
	defer listener.Close()

	// register grpc
	grpcServer := newGRPCServer(cfg)
	kmsproto.RegisterKMSServiceServer(grpcServer, kmsSvc)

	serveErr := make(chan error, 1)
	go func() {
		logger.InfoContext(ctx, "KMS gRPC server started", slog.String("address", cfg.Addr()))
		serveErr <- grpcServer.Serve(listener)
	}()

	shutdownCtx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	select {
	case err := <-serveErr:
		if err != nil {
			return fmt.Errorf("serve KMS gRPC: %w", err)
		}
		return nil
	case <-shutdownCtx.Done():
		logger.InfoContext(ctx, "stopping KMS gRPC server")
		grpcServer.GracefulStop()
		return nil
	}
}
