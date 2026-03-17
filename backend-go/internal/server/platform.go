package server

import (
	projectssvr "github.com/infisical/api/internal/server/gen/http/projects/server"
	genprojects "github.com/infisical/api/internal/server/gen/projects"
)

func (s *Server) mountPlatform() {
	projectsEndpoints := genprojects.NewEndpoints(s.svc.Platform.Projects)
	projectsServer := projectssvr.New(projectsEndpoints, s.mux, s.dec, s.enc, s.eh, nil)
	projectssvr.Mount(s.mux, projectsServer)
	for _, mount := range projectsServer.Mounts {
		s.logger.Info("route mounted", "method", mount.Method, "verb", mount.Verb, "pattern", mount.Pattern)
	}
}
