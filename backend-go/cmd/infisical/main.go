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
	"github.com/infisical/api/internal/server"
	"github.com/infisical/api/internal/services"
)

func main() {
	// Setup structured JSON logger.
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: config.GetConfiguredSlogLevel(),
	}))
	slog.SetDefault(logger)

	// Load configuration.
	cfg, err := config.LoadConfig()
	if err != nil {
		var validationErr *config.ValidationError
		if errors.As(err, &validationErr) {
			slog.Error("invalid environment variables")
			for _, issue := range validationErr.Issues {
				slog.Error("  " + issue)
			}
		} else {
			slog.Error("failed to load config", "error", err)
		}
		os.Exit(1)
	}

	// Initialize all services.
	svc := services.NewService(logger)
	// Create server.
	srv := server.NewServer(svc, logger)

	// Create error channel for signal handling and server errors.
	errc := make(chan error)

	// Setup interrupt handler.
	go func() {
		c := make(chan os.Signal, 1)
		signal.Notify(c, syscall.SIGINT, syscall.SIGTERM)
		errc <- fmt.Errorf("%s", <-c)
	}()

	var wg sync.WaitGroup
	ctx, cancel := context.WithCancel(context.Background())

	// Start HTTP server.
	srv.Listen(ctx, cfg.Addr(), &wg, errc)

	// Wait for signal.
	logger.Info("exiting", "reason", <-errc)

	// Send cancellation signal to server goroutines.
	cancel()
	wg.Wait()

	logger.Info("server stopped")
}
