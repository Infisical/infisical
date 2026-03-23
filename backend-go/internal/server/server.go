package server

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	goahttp "goa.design/goa/v3/http"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/libs/requestid"
	"github.com/infisical/api/internal/server/api"
)

type Server struct {
	svc       *api.Registry
	logger    *slog.Logger
	mux       goahttp.Muxer
	dec       func(*http.Request) goahttp.Decoder
	enc       func(context.Context, http.ResponseWriter) goahttp.Encoder
	eh        func(context.Context, http.ResponseWriter, error)
	formatter func(ctx context.Context, err error) goahttp.Statuser
}

func NewServer(svc *api.Registry, logger *slog.Logger) *Server {
	s := &Server{
		svc:       svc,
		logger:    logger,
		mux:       goahttp.NewMuxer(),
		dec:       goahttp.RequestDecoder,
		enc:       goahttp.ResponseEncoder,
		formatter: errutil.NewFormatter(logger),
	}
	// eh only fires when encoding the error response itself fails.
	s.eh = func(ctx context.Context, w http.ResponseWriter, err error) {
		logger.ErrorContext(ctx, "failed to encode error response", slog.Any("error", err))
	}

	s.mountPlatform()
	s.mountSecretManager()

	return s
}

func (s *Server) Listen(ctx context.Context, addr string, wg *sync.WaitGroup, errc chan error) {
	var handler http.Handler = s.mux
	// the order is other way around. Last one wraps the previous one, so request ID is set before logging.
	handler = requestLogger(handler, s.logger)
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
