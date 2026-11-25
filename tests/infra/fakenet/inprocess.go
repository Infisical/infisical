package fakenet

import (
	"net/http/httptest"
	"testing"
)

// ServeInProcess runs fakenet with services inside the test's process, for a fake's own
// tests. It returns the server the fakes answer on and the admin URL, with this
// process listening for events; both servers close when the test ends.
func ServeInProcess(tt *testing.T, services ...Service) (*httptest.Server, string) {
	tt.Helper()
	srv := New(services...)
	fakes := httptest.NewServer(srv)
	tt.Cleanup(fakes.Close)
	admin := httptest.NewServer(srv.Admin(nil))
	tt.Cleanup(admin.Close)
	if err := Listen(tt.Context(), admin.URL, ""); err != nil {
		tt.Fatalf("fakenet: listening for events: %v", err)
	}
	return fakes, admin.URL
}
