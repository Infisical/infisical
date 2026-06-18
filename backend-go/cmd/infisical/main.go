package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
	redisdb "github.com/infisical/api/internal/database/redis"
	"github.com/infisical/api/internal/ee/services/hsm"
	"github.com/infisical/api/internal/ee/services/license"
	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/libs/bootstrap"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/libs/logutil"
	"github.com/infisical/api/internal/queue"
	"github.com/infisical/api/internal/server"
	"github.com/infisical/api/internal/server/api"
)

func main() {
	// Setup structured JSON logger with context enrichment (e.g. request ID).
	logger := slog.New(logutil.NewContextHandler(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: config.GetConfiguredSlogLevel(),
	}))).With(slog.String("from", "go-sidecar"))
	slog.SetDefault(logger)

	// Load configuration.
	cfg, err := config.LoadConfig()
	if err != nil {
		var validationErr *config.ValidationError
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

	if err := run(cfg, logger); err != nil {
		os.Exit(1)
	}
}

func run(cfg *config.Config, logger *slog.Logger) error {
	ctx := context.Background()

	// Connect to database.
	db, err := pg.NewPostgresDB(ctx, cfg.DBConnectionURI, cfg.DBRootCert, cfg.DBReadReplicas)
	if err != nil {
		logger.ErrorContext(ctx, "failed to initialize database", slog.Any("error", err))
		return err
	}
	defer db.Close()

	dbReport := bootstrap.CheckDBConnection(ctx, db)
	dbReport.PrintReport(logger)

	// Connect to Redis.
	redisClient, err := redisdb.NewClientFromEnvConfig(cfg)
	if err != nil {
		logger.ErrorContext(ctx, "failed to initialize redis", slog.Any("error", err))
		return err
	}
	defer errutil.DeferErr(ctx, redisClient.Close, "closing redis")

	// Initialize KeyStore and Queue.
	ks := keystore.NewKeyStore(redisClient)
	queueSvc := queue.NewService(ctx, logger, redisClient)
	defer errutil.DeferErr(ctx, queueSvc.Close, "closing queue")

	// Initialize License service early (needed for HSM license check).
	licenseSvc := license.NewService(ctx, logger, &license.Deps{
		Config:   cfg,
		DB:       db,
		KeyStore: ks,
	})
	defer licenseSvc.Close()

	// Initialize HSM if configured.
	var hsmSvc *hsm.Service
	if cfg.IsHsmConfigured {
		hsmService, hsmErr := hsm.NewService(hsm.Config{
			LibPath:  cfg.HSMLibPath,
			Slot:     cfg.HSMSlot,
			Pin:      cfg.HSMPin,
			KeyLabel: cfg.HSMKeyLabel,
		})
		if hsmErr != nil {
			logger.ErrorContext(ctx, "failed to initialize HSM", slog.Any("error", hsmErr))
			return hsmErr
		}
		defer errutil.DeferErr(ctx, hsmService.Close, "closing HSM")

		features := licenseSvc.GetOnPremFeatures()
		if err := hsmService.StartService(features.HSM); err != nil {
			logger.ErrorContext(ctx, "failed to start HSM service", slog.Any("error", err))
			return err
		}
		logger.InfoContext(ctx, "HSM service started")
		hsmSvc = hsmService
	}

	services, cleanup, err := api.NewServices(ctx, &api.Infra{
		Logger:   logger,
		Config:   cfg,
		DB:       db,
		Redis:    redisClient,
		HSM:      hsmSvc,
		License:  licenseSvc,
		KeyStore: ks,
		Queue:    queueSvc,
	})
	if err != nil {
		logger.ErrorContext(ctx, "failed to initialize services", slog.Any("error", err))
		return err
	}
	defer cleanup()

	// Create server.
	srv := server.NewServer(services, cfg, logger)

	// Create error channel for signal handling and server errors.
	// Buffered to prevent blocking if multiple senders (signal, queue, HTTP) fire after first receive.
	errc := make(chan error, 4)

	// Setup interrupt handler.
	go func() {
		c := make(chan os.Signal, 1)
		signal.Notify(c, syscall.SIGINT, syscall.SIGTERM)
		errc <- fmt.Errorf("%s", <-c)
	}()

	var wg sync.WaitGroup
	ctx, cancel := context.WithCancel(ctx)

	// Start queue worker.
	wg.Go(func() {
		if err := queueSvc.Start(queue.ServerConfig{Concurrency: 10}); err != nil {
			logger.ErrorContext(ctx, "queue worker error", slog.Any("error", err))
			errc <- err
		}
	})

	// Start HTTP server.
	srv.Listen(ctx, cfg.Addr(), &wg, errc)

	// Wait for signal.
	logger.InfoContext(ctx, "exiting", slog.Any("reason", <-errc))

	// Send cancellation signal to server goroutines.
	cancel()
	wg.Wait()

	logger.InfoContext(ctx, "server stopped")
	return nil
}
