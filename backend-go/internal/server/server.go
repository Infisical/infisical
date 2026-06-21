package server

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/libs/requestid"
	"github.com/infisical/api/internal/server/api"
	"github.com/infisical/api/internal/server/middlewares"
	"github.com/infisical/api/internal/services"
)

// Server is the HTTP server for the Infisical API.
type Server struct {
	services *services.Services
	config   *config.Config
	logger   *slog.Logger
	router   *api.Router
}

// NewServer creates a new HTTP server with chi routing.
func NewServer(svc *services.Services, cfg *config.Config, logger *slog.Logger) *Server {
	router := api.NewRouter(logger, svc)

	return &Server{
		services: svc,
		config:   cfg,
		logger:   logger,
		router:   router,
	}
}

// Listen starts the HTTP server.
func (s *Server) Listen(ctx context.Context, addr string, wg *sync.WaitGroup, errc chan error) {
	var handler http.Handler = s.router

	// Middleware stack (applied in reverse order - last wraps first)
	// Inner middlewares (closest to handler) first, outer middlewares last
	handler = middlewares.ETag(handler)
	handler = requestLogger(handler, s.logger)
	handler = chimw.StripSlashes(handler)
	handler = middlewares.Timeout(100 * time.Second)(handler) // Match Node.js connectionTimeout
	handler = middlewares.CORS(s.buildCORSConfig())(handler)
	handler = middlewares.SecurityHeaders(handler)
	handler = middlewares.Recoverer(s.logger)(handler)
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

type statusRecorder struct {
	http.ResponseWriter
	statusCode int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.statusCode = code
	r.ResponseWriter.WriteHeader(code)
}

func requestLogger(next http.Handler, logger *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &statusRecorder{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(recorder, r)
		logger.InfoContext(r.Context(), "request completed",
			slog.String("reqId", requestid.FromContext(r.Context())),
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Int("statusCode", recorder.statusCode),
			slog.String("duration", time.Since(start).String()),
			slog.String("remote", r.RemoteAddr),
		)
	})
}

// buildCORSConfig creates CORS config from server configuration.
// Matches the Node.js @fastify/cors configuration.
func (s *Server) buildCORSConfig() *middlewares.CORSConfig {
	cfg := &middlewares.CORSConfig{
		AllowCredentials: true,
	}

	// Parse comma-separated allowed headers
	if s.config.CORSAllowedHeaders != "" {
		for h := range strings.SplitSeq(s.config.CORSAllowedHeaders, ",") {
			if h = strings.TrimSpace(h); h != "" {
				cfg.AllowedHeaders = append(cfg.AllowedHeaders, h)
			}
		}
	}

	// Parse comma-separated allowed origins
	if s.config.CORSAllowedOrigins != "" {
		for o := range strings.SplitSeq(s.config.CORSAllowedOrigins, ",") {
			if o = strings.TrimSpace(o); o != "" {
				cfg.AllowedOrigins = append(cfg.AllowedOrigins, o)
			}
		}
	}

	// Add site URL to allowed origins
	if s.config.SiteURL != "" {
		cfg.AllowedOrigins = append(cfg.AllowedOrigins, s.config.SiteURL)
	}

	// If no origins configured, allow all (matches Node.js behavior)
	if len(cfg.AllowedOrigins) == 0 {
		cfg.AllowedOrigins = []string{"*"}
		cfg.AllowCredentials = false // Can't use credentials with wildcard
	}

	return cfg
}
