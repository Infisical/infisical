package aws

import (
	"encoding/json"
	"encoding/xml"
	"io"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

const route53Namespace = "https://route53.amazonaws.com/doc/2013-04-01/"

// HostedZones is one account's Route 53 hosted zones, by zone id. TXT records are
// served over fakenet's DNS as Route 53's nameservers would serve them, so a CA
// checking DNS-01 finds a record created here.
type HostedZones struct {
	Policy
	Zones map[string]*HostedZone `json:"zones"`

	mu       sync.Mutex
	released bool
	events   fakenet.Emitter
	svc      service
}

// HostedZone is a public zone. Names are fully qualified, with the trailing dot Route
// 53 stores them with.
type HostedZone struct {
	ID      string       `json:"id"`
	Name    string       `json:"name"`
	Records []*RecordSet `json:"records,omitempty"`
}

// RecordSet is one name and type in a zone. TXT values keep the quotes Route 53 requires.
type RecordSet struct {
	Name   string   `json:"name"`
	Type   string   `json:"type"`
	TTL    int      `json:"ttl"`
	Values []string `json:"values"`
}

func newHostedZones(svc service, events fakenet.Emitter) fakenet.Fake {
	return &HostedZones{Zones: map[string]*HostedZone{}, events: events, svc: svc}
}

func (z *HostedZones) Snapshot() ([]byte, error) {
	z.mu.Lock()
	defer z.mu.Unlock()
	return json.Marshal(struct {
		Policy
		Zones map[string]*HostedZone `json:"zones"`
	}{z.Policy, z.Zones})
}

// Seed merges zones by id. Zone and record names are canonicalized as the API stores
// them, and DNS then answers with the seeded zones' TXT records, so a reseed that drops
// one withdraws it. Names outside the seeded zones are left as they are.
func (z *HostedZones) Seed(raw []byte) error {
	var in struct {
		Policy
		Zones map[string]*HostedZone `json:"zones"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	z.mu.Lock()
	defer z.mu.Unlock()
	z.merge(in.Policy)
	if len(in.Zones) == 0 {
		return nil
	}
	before := z.txtAnswers()
	var written, removed []string
	for id, zone := range in.Zones {
		if old, ok := z.Zones[id]; ok {
			removed = append(removed, old.txtNames()...)
		}
		zone.ID = id
		zone.Name = fqdn(zone.Name)
		for _, r := range zone.Records {
			r.Name = fqdn(r.Name)
		}
		z.Zones[id] = zone
		written = append(written, zone.txtNames()...)
	}
	z.publishTXT(written, removed, before)
	z.publishCNAMEs()
	return nil
}

// Release withdraws this account's TXT and CNAME answers when the test removes its
// scope, leaving a TXT name another publisher has written since. Fakenet can hand the
// scope to a request before the removal and run it after, so released stops that
// request from publishing them again.
func (z *HostedZones) Release() {
	z.mu.Lock()
	defer z.mu.Unlock()
	z.released = true
	for name, values := range z.txtAnswers() {
		z.events.ReplaceTXT(name, values)
	}
	publicCNAMEs.Lock()
	defer publicCNAMEs.Unlock()
	delete(publicCNAMEs.m, z)
}

func fqdn(name string) string {
	if strings.HasSuffix(name, ".") {
		return strings.ToLower(name)
	}
	return strings.ToLower(name) + "."
}

func (z *HostedZones) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h := handler{svc: z.svc}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		h.fail(w, errf(http.StatusBadRequest, "InvalidInput", "reading the body: %v", err))
		return
	}
	akid, aErr := authenticate(z.svc, r, body)
	if aErr != nil {
		h.fail(w, aErr)
		return
	}

	rest, ok := strings.CutPrefix(r.URL.Path, "/2013-04-01/")
	if !ok {
		h.fail(w, errf(http.StatusNotFound, "UnknownOperationException", "unknown path %s", r.URL.Path))
		return
	}
	parts := strings.Split(strings.Trim(rest, "/"), "/")

	var action string
	switch {
	case r.Method == http.MethodGet && len(parts) == 2 && parts[0] == "hostedzone":
		action = "GetHostedZone"
	case r.Method == http.MethodPost && len(parts) == 3 && parts[0] == "hostedzone" && parts[2] == "rrset":
		action = "ChangeResourceRecordSets"
	default:
		h.fail(w, errf(http.StatusNotFound, "UnknownOperationException", "unknown operation %s %s", r.Method, r.URL.Path))
		return
	}

	z.mu.Lock()
	var out any
	if z.denies(z.svc.name, action) {
		aErr = errf(http.StatusForbidden, "AccessDenied",
			"User: arn:aws:iam::%s:user/infisical is not authorized to perform: route53:%s", AccountID(owner(akid)), action)
	} else {
		switch action {
		case "GetHostedZone":
			out, aErr = z.getHostedZone(parts[1])
		case "ChangeResourceRecordSets":
			out, aErr = z.change(parts[1], body)
		}
	}
	z.mu.Unlock()

	if aErr != nil {
		h.fail(w, aErr)
		return
	}
	w.Header().Set("Content-Type", "text/xml")
	w.Header().Set("x-amzn-RequestId", requestID())
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, xml.Header)
	_ = xml.NewEncoder(w).Encode(out)
}

func (z *HostedZones) zone(id string) (*HostedZone, *apiError) {
	id = strings.TrimPrefix(id, "hostedzone/")
	zone, ok := z.Zones[id]
	if !ok {
		return nil, errf(http.StatusNotFound, "NoSuchHostedZone", "No hosted zone found with ID: %s", id)
	}
	return zone, nil
}

type route53HostedZone struct {
	ID                     string `xml:"Id"`
	Name                   string `xml:"Name"`
	CallerReference        string `xml:"CallerReference"`
	PrivateZone            bool   `xml:"Config>PrivateZone"`
	ResourceRecordSetCount int    `xml:"ResourceRecordSetCount"`
}

func (z *HostedZones) getHostedZone(id string) (any, *apiError) {
	zone, aErr := z.zone(id)
	if aErr != nil {
		return nil, aErr
	}
	return struct {
		XMLName     xml.Name          `xml:"GetHostedZoneResponse"`
		Xmlns       string            `xml:"xmlns,attr"`
		HostedZone  route53HostedZone `xml:"HostedZone"`
		NameServers []string          `xml:"DelegationSet>NameServers>NameServer"`
	}{
		Xmlns:       route53Namespace,
		HostedZone:  route53HostedZone{ID: "/hostedzone/" + zone.ID, Name: zone.Name, CallerReference: zone.ID, ResourceRecordSetCount: len(zone.Records) + 2},
		NameServers: []string{"ns-1.awsdns-01.com", "ns-2.awsdns-02.net"},
	}, nil
}

type route53RecordSet struct {
	Name   string   `xml:"Name"`
	Type   string   `xml:"Type"`
	TTL    int      `xml:"TTL"`
	Values []string `xml:"ResourceRecords>ResourceRecord>Value"`
}

type changeInfo struct {
	ID          string `xml:"Id"`
	Status      string `xml:"Status"`
	SubmittedAt string `xml:"SubmittedAt"`
	Comment     string `xml:"Comment,omitempty"`
}

type changeInfoResponse struct {
	XMLName    xml.Name
	ChangeInfo changeInfo `xml:"ChangeInfo"`
}

func invalidChangeBatch(format string, args ...any) *apiError {
	return errf(http.StatusBadRequest, "InvalidChangeBatch", format, args...)
}

// publicCNAMEs is every CNAME value the Route 53 fake serves, by account and record
// name, which ACM reads to validate a domain as it would through public DNS. Keyed by
// account so one account's changes, reseeds and release never touch another's. Its
// lock is taken last, under a zone's or ACM's own.
var publicCNAMEs = struct {
	sync.Mutex
	m map[*HostedZones]map[string][]string
}{m: map[*HostedZones]map[string][]string{}}

// cnameServed reports whether a CNAME name answers with value in any account, ignoring
// case and the trailing dot.
func cnameServed(name, value string) bool {
	publicCNAMEs.Lock()
	defer publicCNAMEs.Unlock()
	for _, names := range publicCNAMEs.m {
		if slices.ContainsFunc(names[fqdn(name)], func(v string) bool { return fqdn(v) == fqdn(value) }) {
			return true
		}
	}
	return false
}

// publishCNAMEs replaces this account's entry in publicCNAMEs with its zones' current
// CNAMEs. It runs under z.mu.
func (z *HostedZones) publishCNAMEs() {
	if z.released {
		return
	}
	names := map[string][]string{}
	for _, zone := range z.Zones {
		for _, r := range zone.Records {
			if r.Type == "CNAME" {
				names[r.Name] = append(names[r.Name], r.Values...)
			}
		}
	}
	publicCNAMEs.Lock()
	defer publicCNAMEs.Unlock()
	publicCNAMEs.m[z] = names
}

// change applies a batch atomically. It runs under z.mu and updates fakenet's DNS before
// publishing, so concurrent changes reach DNS in commit order and an event's observer
// already reads the committed answer.
func (z *HostedZones) change(zoneID string, body []byte) (any, *apiError) {
	zone, aErr := z.zone(zoneID)
	if aErr != nil {
		return nil, aErr
	}
	var in struct {
		Comment string `xml:"ChangeBatch>Comment"`
		Changes []struct {
			Action string           `xml:"Action"`
			Set    route53RecordSet `xml:"ResourceRecordSet"`
		} `xml:"ChangeBatch>Changes>Change"`
	}
	if err := xml.Unmarshal(body, &in); err != nil {
		return nil, errf(http.StatusBadRequest, "InvalidInput", "%v", err)
	}
	if len(in.Changes) == 0 {
		return nil, errf(http.StatusBadRequest, "InvalidInput", "Changes must contain at least one change")
	}

	var before map[string][]string
	records := slices.Clone(zone.Records)
	var events []fakenet.Event
	var written, removed []string
	cnameChanged := false
	for _, ch := range in.Changes {
		set := RecordSet{Name: fqdn(ch.Set.Name), Type: ch.Set.Type, TTL: ch.Set.TTL, Values: ch.Set.Values}
		if set.Name != zone.Name && !strings.HasSuffix(set.Name, "."+zone.Name) {
			return nil, invalidChangeBatch("RRSet with DNS name %s is not permitted in zone %s", set.Name, zone.Name)
		}
		if set.Type == "TXT" {
			for _, v := range set.Values {
				if len(v) < 2 || !strings.HasPrefix(v, `"`) || !strings.HasSuffix(v, `"`) {
					return nil, invalidChangeBatch("Invalid Resource Record: 'FATAL problem: InvalidCharacterString (Value should be enclosed in quotation marks) encountered with '%s''", v)
				}
			}
		}
		i := slices.IndexFunc(records, func(r *RecordSet) bool { return r.Name == set.Name && r.Type == set.Type })
		detail := RecordDetail{ZoneID: zone.ID, Name: set.Name, Type: set.Type}
		switch ch.Action {
		case "UPSERT":
			if i >= 0 {
				records[i] = &set
			} else {
				records = append(records, &set)
			}
			events = append(events, RecordChanged{detail, "UPSERT"})
		case "DELETE":
			if i < 0 || !slices.Equal(records[i].Values, set.Values) {
				return nil, invalidChangeBatch("Tried to delete resource record set [name='%s', type='%s'] but it was not found", set.Name, set.Type)
			}
			records = slices.Delete(records, i, i+1)
			events = append(events, RecordChanged{detail, "DELETE"})
		default:
			return nil, errf(http.StatusBadRequest, "InvalidInput", "Invalid action %s", ch.Action)
		}
		switch {
		case set.Type == "TXT" && ch.Action == "UPSERT":
			written = append(written, set.Name)
		case set.Type == "TXT":
			removed = append(removed, set.Name)
		case set.Type == "CNAME":
			cnameChanged = true
		}
	}
	if len(written) > 0 || len(removed) > 0 {
		before = z.txtAnswers()
	}
	zone.Records = records
	z.publishTXT(written, removed, before)
	if cnameChanged {
		z.publishCNAMEs()
	}
	for _, ev := range events {
		z.events.Publish(ev)
	}
	return changeInfoResponse{
		XMLName:    xml.Name{Space: route53Namespace, Local: "ChangeResourceRecordSetsResponse"},
		ChangeInfo: changeInfo{ID: "/change/C" + strings.ToUpper(id.Hex(10)), Status: "INSYNC", SubmittedAt: time.Now().UTC().Format(time.RFC3339), Comment: in.Comment},
	}, nil
}

// publishTXT sets fakenet's DNS answer for each written name to the account's current
// TXT values, replacing whatever another publisher wrote. A name the change only removed
// records from gets the values left, or none, only while DNS still answers with what the
// account published before the change, so another publisher's answer stays. It runs
// under z.mu.
func (z *HostedZones) publishTXT(written, removed []string, before map[string][]string) {
	if z.released || len(written)+len(removed) == 0 {
		return
	}
	answers := z.txtAnswers()
	for _, name := range written {
		if len(answers[name]) > 0 {
			z.events.SetTXT(name, answers[name]...)
		}
	}
	for _, name := range append(removed, written...) {
		if !slices.Contains(written, name) || len(answers[name]) == 0 {
			z.events.ReplaceTXT(name, before[name], answers[name]...)
		}
	}
}

// txtAnswers is what the account publishes for each of its TXT names: every value
// under the name across its zones, unquoted and without the trailing dot, as fakenet's
// DNS answers it.
func (z *HostedZones) txtAnswers() map[string][]string {
	out := map[string][]string{}
	for _, zone := range z.Zones {
		for _, r := range zone.Records {
			if r.Type == "TXT" {
				for _, v := range r.Values {
					out[r.Name] = append(out[r.Name], strings.Trim(v, `"`))
				}
			}
		}
	}
	return out
}

// txtNames is every TXT record name in the zone.
func (zone *HostedZone) txtNames() []string {
	var out []string
	for _, r := range zone.Records {
		if r.Type == "TXT" {
			out = append(out, r.Name)
		}
	}
	return out
}
