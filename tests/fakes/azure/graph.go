package azure

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Graph answers as graph.microsoft.com for the Teams integration. It is scoped by the
// tenant id the bearer token names (`tid`), so a test opens it with the tenant it
// consented in and seeds the teams, channels and app catalog that tenant holds.
var Graph = graphService{}

type graphService struct{}

func (graphService) Host() string { return "graph.microsoft.com" }

func (graphService) Scope(r *http.Request) (string, bool) {
	if aud, _ := jwtClaim(r, "aud"); aud != "https://graph.microsoft.com" {
		return "", false
	}
	return jwtClaim(r, "tid")
}

func (graphService) New(events fakenet.Emitter) fakenet.Fake {
	d := &Directory{events: events}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1.0/appCatalogs/teamsApps", d.apps)
	mux.HandleFunc("GET /v1.0/teams", d.teams)
	mux.HandleFunc("GET /v1.0/teams/{team}/installedApps", d.installedApps)
	mux.HandleFunc("GET /v1.0/teams/{team}/channels", d.channels)
	d.mux = mux
	return d
}

// Directory is one tenant's Teams catalog and teams.
type Directory struct {
	Apps  []CatalogApp `json:"apps"`
	Teams []Team       `json:"teams"`

	// PageSize caps every list page, whatever else is asked, so a list longer than it
	// is served through @odata.nextLink. Zero means 100, Graph's default.
	PageSize int `json:"pageSize,omitempty"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
}

// CatalogApp is an app in the tenant's Teams app catalog. ExternalID is the bot's
// Microsoft app id; ID is the catalog's own id for the app.
type CatalogApp struct {
	ID                 string `json:"id"`
	DisplayName        string `json:"displayName"`
	DistributionMethod string `json:"distributionMethod"`
	ExternalID         string `json:"externalId"`
}

// Team is a team, the catalog ids of the apps installed in it, and its channels.
type Team struct {
	ID            string    `json:"id"`
	DisplayName   string    `json:"displayName"`
	InstalledApps []string  `json:"installedApps"`
	Channels      []Channel `json:"channels"`
}

type Channel struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
}

// WithApp is a seed fragment publishing an app to the tenant's catalog.
func WithApp(catalogID, botID string) any {
	return Directory{Apps: []CatalogApp{{ID: catalogID, DisplayName: "Infisical", DistributionMethod: "organization", ExternalID: botID}}}
}

// WithTeam is a seed fragment adding a team. installedApps are catalog ids.
func WithTeam(team Team) any { return Directory{Teams: []Team{team}} }

// WithPageSize is a seed fragment capping list pages.
func WithPageSize(n int) any { return Directory{PageSize: n} }

func (d *Directory) ServeHTTP(w http.ResponseWriter, r *http.Request) { d.mux.ServeHTTP(w, r) }

func (d *Directory) apps(w http.ResponseWriter, _ *http.Request) {
	d.mu.Lock()
	defer d.mu.Unlock()
	apps := d.Apps
	if apps == nil {
		apps = []CatalogApp{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"value": apps})
}

// page serves items[skip:skip+size], with the nextLink for the rest. $skiptoken is an
// opaque offset, as Graph's are opaque.
func page[T any](d *Directory, w http.ResponseWriter, r *http.Request, items []T, render func(T) any) {
	size := d.PageSize
	if size <= 0 {
		size = 100
	}
	skip := 0
	if token := r.URL.Query().Get("$skiptoken"); token != "" {
		raw, err := base64.RawURLEncoding.DecodeString(token)
		if err == nil {
			skip, err = strconv.Atoi(strings.TrimPrefix(string(raw), "skip:"))
		}
		if err != nil || skip < 0 || skip > len(items) {
			graphError(w, http.StatusBadRequest, "BadRequest", "Invalid page token.")
			return
		}
	}
	end := min(skip+size, len(items))
	value := make([]any, 0, end-skip)
	for _, item := range items[skip:end] {
		value = append(value, render(item))
	}
	out := map[string]any{"value": value}
	if end < len(items) {
		token := base64.RawURLEncoding.EncodeToString([]byte("skip:" + strconv.Itoa(end)))
		out["@odata.nextLink"] = "https://" + r.Host + r.URL.Path + "?$skiptoken=" + token
	}
	writeJSON(w, http.StatusOK, out)
}

func (d *Directory) teams(w http.ResponseWriter, r *http.Request) {
	d.mu.Lock()
	defer d.mu.Unlock()
	page(d, w, r, d.Teams, func(t Team) any { return map[string]string{"id": t.ID, "displayName": t.DisplayName} })
}

func (d *Directory) team(w http.ResponseWriter, r *http.Request) (Team, bool) {
	for _, t := range d.Teams {
		if t.ID == r.PathValue("team") {
			return t, true
		}
	}
	graphError(w, http.StatusNotFound, "NotFound", "No team found with Group Id "+r.PathValue("team"))
	return Team{}, false
}

func (d *Directory) installedApps(w http.ResponseWriter, r *http.Request) {
	d.mu.Lock()
	defer d.mu.Unlock()
	team, ok := d.team(w, r)
	if !ok {
		return
	}
	expand := r.URL.Query().Get("$expand") == "teamsAppDefinition"
	page(d, w, r, team.InstalledApps, func(appID string) any {
		installed := map[string]any{"id": team.ID + "-" + appID}
		if expand {
			installed["teamsAppDefinition"] = map[string]any{"teamsAppId": appID}
		}
		return installed
	})
}

func (d *Directory) channels(w http.ResponseWriter, r *http.Request) {
	d.mu.Lock()
	defer d.mu.Unlock()
	team, ok := d.team(w, r)
	if !ok {
		return
	}
	page(d, w, r, team.Channels, func(c Channel) any { return map[string]string{"id": c.ID, "displayName": c.DisplayName} })
}

func graphError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func (d *Directory) Snapshot() ([]byte, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	return json.Marshal(d)
}

func (d *Directory) Seed(raw []byte) error {
	var in Directory
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	d.Apps = append(d.Apps, in.Apps...)
	d.Teams = append(d.Teams, in.Teams...)
	if in.PageSize > 0 {
		d.PageSize = in.PageSize
	}
	return nil
}

// GraphControlPlane is a test's view of one tenant's Graph directory.
type GraphControlPlane struct {
	*fakenet.Scope[Directory]
	TenantID string
}

func OpenGraph(tt *testing.T, adminURL, tenantID string) *GraphControlPlane {
	tt.Helper()
	return &GraphControlPlane{Scope: fakenet.Open[Directory](tt, adminURL, Graph.Host(), tenantID), TenantID: tenantID}
}
