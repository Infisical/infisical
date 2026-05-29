package server

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/infisical/api/internal/libs/requestid"
	"github.com/infisical/api/internal/server/api"
	"github.com/infisical/api/internal/server/middlewares"
)

// Server is the HTTP server for the Infisical API.
type Server struct {
	services *api.Services
	logger   *slog.Logger
	router   chi.Router
}

// NewServer creates a new HTTP server with chi routing.
func NewServer(services *api.Services, logger *slog.Logger) *Server {
	router := chi.NewRouter()

	// Register domain routes
	api.RegisterPlatformRoutes(router, logger, services.Platform)
	api.RegisterSecretManagerRoutes(router, logger, services.Platform, services.SecretManager)

	return &Server{
		services: services,
		logger:   logger,
		router:   router,
	}
}

// Listen starts the HTTP server.
func (s *Server) Listen(ctx context.Context, addr string, wg *sync.WaitGroup, errc chan error) {
	var handler http.Handler = s.router

	// Middleware stack (applied in reverse order - last wraps first)
	handler = requestLogger(handler, s.logger)
	handler = middlewares.HTTPInfoMiddleware(handler)
	handler = chimw.StripSlashes(handler)
	handler = requestid.Middleware(handler)

	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 60 * time.Second,
	}

	wg.Go(func() {
		go func() {
			s.logger.InfoContext(ctx, "HTTP server listening", slog.String("addr", addr))
			errc <- srv.ListenAndServe()
		}()

		<-ctx.Done()
		s.logger.InfoContext(ctx, "shutting down HTTP server", slog.String("addr", addr))

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			s.logger.ErrorContext(ctx, "HTTP server shutdown error", slog.Any("error", err))
		}
	})
}

func requestLogger(next http.Handler, logger *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		logger.InfoContext(r.Context(), "request",
			slog.String("reqId", requestid.FromContext(r.Context())),
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.String("duration", time.Since(start).String()),
			slog.String("remote", r.RemoteAddr),
		)
	})
}
