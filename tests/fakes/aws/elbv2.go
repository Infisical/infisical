package aws

import (
	"encoding/json"
	"net/http"
	"slices"
	"strconv"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// LoadBalancing is one account's Elastic Load Balancing v2 listeners in the served
// region, by listener ARN. Load balancers and listeners are what the test seeds;
// Infisical only manages the certificates on them.
type LoadBalancing struct {
	Policy
	Listeners map[string]*Listener `json:"listeners"`

	mu     sync.Mutex
	events fakenet.Emitter
	h      handler
}

// Listener is an HTTPS listener: its default certificate and the extra ones in its
// certificate list.
type Listener struct {
	ARN                string   `json:"arn"`
	LoadBalancerArn    string   `json:"loadBalancerArn"`
	Port               int      `json:"port"`
	Protocol           string   `json:"protocol"`
	DefaultCertificate string   `json:"defaultCertificate,omitempty"`
	Certificates       []string `json:"certificates,omitempty"`
}

func newLoadBalancing(svc service, events fakenet.Emitter) fakenet.Fake {
	lb := &LoadBalancing{Listeners: map[string]*Listener{}, events: events}
	lb.h = handler{svc: svc, mu: &lb.mu, policy: func() *Policy { return &lb.Policy }, actions: map[string]func(call) (any, *apiError){
		"DescribeListenerCertificates": lb.describeListenerCertificates,
		"AddListenerCertificates":      lb.addListenerCertificates,
		"RemoveListenerCertificates":   lb.removeListenerCertificates,
	}}
	return lb
}

func (lb *LoadBalancing) ServeHTTP(w http.ResponseWriter, r *http.Request) { lb.h.serve(w, r) }

func (lb *LoadBalancing) Snapshot() ([]byte, error) {
	lb.mu.Lock()
	defer lb.mu.Unlock()
	return json.Marshal(struct {
		Policy
		Listeners map[string]*Listener `json:"listeners"`
	}{lb.Policy, lb.Listeners})
}

func (lb *LoadBalancing) Seed(raw []byte) error {
	var in struct {
		Policy
		Listeners map[string]*Listener `json:"listeners"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	lb.mu.Lock()
	defer lb.mu.Unlock()
	lb.merge(in.Policy)
	for arn, l := range in.Listeners {
		l.ARN = arn
		if l.Protocol == "" {
			l.Protocol = "HTTPS"
		}
		lb.Listeners[arn] = l
	}
	return nil
}

func (lb *LoadBalancing) listener(c call) (*Listener, *apiError) {
	l, ok := lb.Listeners[c.form.Get("ListenerArn")]
	if !ok {
		return nil, errf(http.StatusBadRequest, "ListenerNotFound", "One or more listeners not found")
	}
	return l, nil
}

// memberCertificates reads Certificates.member.N.CertificateArn.
func memberCertificates(c call) []string {
	var out []string
	for i := 1; ; i++ {
		v := c.form.Get("Certificates.member." + strconv.Itoa(i) + ".CertificateArn")
		if v == "" {
			return out
		}
		out = append(out, v)
	}
}

type elbCertificate struct {
	CertificateArn string `xml:"CertificateArn"`
	IsDefault      *bool  `xml:"IsDefault,omitempty"`
}

type elbCertificates struct {
	Members []elbCertificate `xml:"Certificates>member"`
}

func (lb *LoadBalancing) describeListenerCertificates(c call) (any, *apiError) {
	l, aErr := lb.listener(c)
	if aErr != nil {
		return nil, aErr
	}
	out := elbCertificates{Members: []elbCertificate{}}
	if l.DefaultCertificate != "" {
		out.Members = append(out.Members, elbCertificate{CertificateArn: l.DefaultCertificate, IsDefault: new(true)})
	}
	for _, arn := range l.Certificates {
		out.Members = append(out.Members, elbCertificate{CertificateArn: arn, IsDefault: new(false)})
	}
	return out, nil
}

func (lb *LoadBalancing) addListenerCertificates(c call) (any, *apiError) {
	l, aErr := lb.listener(c)
	if aErr != nil {
		return nil, aErr
	}
	arns := memberCertificates(c)
	if len(arns) == 0 {
		return nil, errf(http.StatusBadRequest, "ValidationError", "A certificate must be specified")
	}
	out := elbCertificates{}
	for _, arn := range arns {
		if !slices.Contains(l.Certificates, arn) {
			l.Certificates = append(l.Certificates, arn)
			lb.events.Publish(ListenerCertificateAdded{ListenerDetail{ListenerArn: l.ARN}, arn})
		}
		out.Members = append(out.Members, elbCertificate{CertificateArn: arn})
	}
	return out, nil
}

func (lb *LoadBalancing) removeListenerCertificates(c call) (any, *apiError) {
	l, aErr := lb.listener(c)
	if aErr != nil {
		return nil, aErr
	}
	arns := memberCertificates(c)
	if len(arns) == 0 {
		return nil, errf(http.StatusBadRequest, "ValidationError", "A certificate must be specified")
	}
	if slices.Contains(arns, l.DefaultCertificate) {
		return nil, errf(http.StatusBadRequest, "OperationNotPermitted", "The default certificate cannot be removed from a listener")
	}
	for _, arn := range arns {
		if i := slices.Index(l.Certificates, arn); i >= 0 {
			l.Certificates = slices.Delete(l.Certificates, i, i+1)
			lb.events.Publish(ListenerCertificateRemoved{ListenerDetail{ListenerArn: l.ARN}, arn, time.Now()})
		}
	}
	return struct{}{}, nil
}
