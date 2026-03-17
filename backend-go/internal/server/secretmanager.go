package server

import (
	secretssvr "github.com/infisical/api/internal/server/gen/http/secrets/server"
	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
)

func (s *Server) mountSecretManager() {
	secretsEndpoints := gensecrets.NewEndpoints(s.svc.SecretManager.Secrets)
	secretsServer := secretssvr.New(secretsEndpoints, s.mux, s.dec, s.enc, s.eh, nil)
	secretssvr.Mount(s.mux, secretsServer)
	for _, mount := range secretsServer.Mounts {
		s.logger.Info("route mounted", "method", mount.Method, "verb", mount.Verb, "pattern", mount.Pattern)
	}
}
