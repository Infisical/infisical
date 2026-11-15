package ldap

import (
	"log"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/jimlambrt/gldap"
)

// Serve answers LDAP on addr, routing each operation to the directory its DN names.
func Serve(addr string, srv *fakenet.Server) error {
	s, err := gldap.NewServer()
	if err != nil {
		return err
	}
	mux, err := gldap.NewMux()
	if err != nil {
		return err
	}

	directory := func(dn string) *Directory {
		fake, ok := srv.Lookup(Service.Host(), ScopeOf(dn))
		if !ok {
			return nil
		}
		d, _ := fake.(*Directory)
		return d
	}

	if err := mux.Bind(func(w *gldap.ResponseWriter, r *gldap.Request) {
		resp := r.NewBindResponse(gldap.WithResponseCode(gldap.ResultInvalidCredentials))
		defer func() { _ = w.Write(resp) }()
		m, err := r.GetSimpleBindMessage()
		if err != nil {
			return
		}
		ok := false
		if d := directory(m.UserName); d != nil && d.Authenticate(m.UserName, string(m.Password)) {
			resp.SetResultCode(gldap.ResultSuccess)
			ok = true
		}
		log.Printf("LDAP   bind %s -> %v", m.UserName, ok)
	}); err != nil {
		return err
	}

	if err := mux.Search(func(w *gldap.ResponseWriter, r *gldap.Request) {
		resp := r.NewSearchDoneResponse(gldap.WithResponseCode(gldap.ResultNoSuchObject))
		defer func() { _ = w.Write(resp) }()
		m, err := r.GetSearchMessage()
		if err != nil {
			return
		}
		d := directory(m.BaseDN)
		if d == nil {
			return
		}
		for _, e := range d.Search(m.BaseDN, m.Filter) {
			_ = w.Write(r.NewSearchResponseEntry(e.DN, gldap.WithAttributes(e.Attributes)))
		}
		resp.SetResultCode(gldap.ResultSuccess)
		log.Printf("LDAP   search %s %s", m.BaseDN, m.Filter)
	}); err != nil {
		return err
	}

	if err := s.Router(mux); err != nil {
		return err
	}
	return s.Run(addr)
}
