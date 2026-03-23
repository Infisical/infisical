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
	"github.com/infisical/api/internal/libs/bootstrap"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/libs/logutil"
	"github.com/infisical/api/internal/server"
	"github.com/infisical/api/internal/server/api"
	"github.com/infisical/api/internal/services"
)

func main() {
	// Setup structured JSON logger with context enrichment (e.g. request ID).
	logger := slog.New(logutil.NewContextHandler(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: config.GetConfiguredSlogLevel(),
	})))
	slog.SetDefault(logger)

	// Load configuration.
	cfg, err := config.LoadConfig()
	if err != nil {
		var validationErr *config.ValidationError
		if errors.As(err, &validationErr) {
			slog.ErrorContext(context.Background(), "invalid environment variables")
			for _, issue := range validationErr.Issues {
				slog.ErrorContext(context.Background(), "  "+issue)
			}
		} else {
			slog.ErrorContext(context.Background(), "failed to load config", slog.Any("error", err))
		}
		os.Exit(1)
	}

	// Connect to database.
	ctx := context.Background()
	db, err := pg.NewPostgresDB(ctx, cfg.DBConnectionURI, cfg.DBRootCert, cfg.DBReadReplicas)
	if err != nil {
		logger.ErrorContext(ctx, "failed to initialize database", slog.Any("error", err))
		os.Exit(1)
	}
	defer errutil.DeferErr(ctx, db.Close, "closing database")

	dbReport := bootstrap.CheckDBConnection(ctx, db)
	dbReport.PrintReport(logger)

	registry, err := api.NewRegistry(ctx, logger, db, services.ServicesDeps{
		Logger:   logger,
		Config:   cfg,
		DB:       db,
		HSM:      nil,
		KeyStore: nil,
	})

	if err != nil {
		logger.ErrorContext(ctx, "failed to initialize services", slog.Any("error", err))
		return
	}
	// Create server.
	srv := server.NewServer(registry, logger)

	// Create error channel for signal handling and server errors.
	errc := make(chan error)

	// Setup interrupt handler.
	go func() {
		c := make(chan os.Signal, 1)
		signal.Notify(c, syscall.SIGINT, syscall.SIGTERM)
		errc <- fmt.Errorf("%s", <-c)
	}()

	var wg sync.WaitGroup
	ctx, cancel := context.WithCancel(ctx)

	// Start HTTP server.
	srv.Listen(ctx, cfg.Addr(), &wg, errc)

	// Wait for signal.
	logger.InfoContext(ctx, "exiting", slog.Any("reason", <-errc))

	// Send cancellation signal to server goroutines.
	cancel()
	wg.Wait()

	logger.InfoContext(ctx, "server stopped")
}
