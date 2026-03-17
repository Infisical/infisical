package server

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/infisical/api/internal/services"
	goahttp "goa.design/goa/v3/http"
)

type Server struct {
	svc    *services.Registry
	logger *slog.Logger
	mux    goahttp.Muxer
	dec    func(*http.Request) goahttp.Decoder
	enc    func(context.Context, http.ResponseWriter) goahttp.Encoder
	eh     func(context.Context, http.ResponseWriter, error)
}

func NewServer(svc *services.Registry, logger *slog.Logger) *Server {
	s := &Server{
		svc:    svc,
		logger: logger,
		mux:    goahttp.NewMuxer(),
		dec:    goahttp.RequestDecoder,
		enc:    goahttp.ResponseEncoder,
	}
	s.eh = func(ctx context.Context, w http.ResponseWriter, err error) {
		logger.ErrorContext(ctx, "server error", "error", err)
	}

	s.mountPlatform()
	s.mountSecretManager()

	return s
}

func (s *Server) Listen(ctx context.Context, addr string, wg *sync.WaitGroup, errc chan error) {
	var handler http.Handler = requestLogger(s.mux, s.logger)

	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 60 * time.Second,
	}

	wg.Add(1)
	go func() {
		defer wg.Done()

		go func() {
			s.logger.Info("HTTP server listening", "addr", addr)
			errc <- srv.ListenAndServe()
		}()

		<-ctx.Done()
		s.logger.Info("shutting down HTTP server", "addr", addr)

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			s.logger.Error("HTTP server shutdown error", "error", err)
		}
	}()
}

func requestLogger(next http.Handler, logger *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		logger.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"duration", time.Since(start).String(),
			"remote", r.RemoteAddr,
		)
	})
}
