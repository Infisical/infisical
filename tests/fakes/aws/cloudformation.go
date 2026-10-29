package aws

import (
	"encoding/json"
	"net/http"
	"slices"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// CloudFormationAccount is one account's stacks in the served region. Nothing Infisical
// calls changes a stack, so they exist only by seeding.
type CloudFormationAccount struct {
	Policy
	Stacks map[string]*Stack `json:"stacks"`

	mu sync.Mutex
	h  handler
}

type Stack struct {
	StackName    string    `json:"stackName"`
	StackID      string    `json:"stackId"`
	StackStatus  string    `json:"stackStatus"`
	CreationTime time.Time `json:"creationTime"`
}

func newCloudFormation(svc service, _ fakenet.Emitter) fakenet.Fake {
	a := &CloudFormationAccount{Stacks: map[string]*Stack{}}
	a.h = handler{svc: svc, mu: &a.mu, policy: func() *Policy { return &a.Policy }, actions: map[string]func(call) (any, *apiError){
		"DescribeStacks": a.describeStacks,
	}}
	return a
}

func (a *CloudFormationAccount) ServeHTTP(w http.ResponseWriter, r *http.Request) { a.h.serve(w, r) }

func (a *CloudFormationAccount) Snapshot() ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return json.Marshal(struct {
		Policy
		Stacks map[string]*Stack `json:"stacks"`
	}{a.Policy, a.Stacks})
}

func (a *CloudFormationAccount) Seed(raw []byte) error {
	var in struct {
		Policy
		Stacks map[string]*Stack `json:"stacks"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.merge(in.Policy)
	for name, st := range in.Stacks {
		st.StackName = name
		if st.StackID == "" {
			st.StackID = "arn:aws:cloudformation:" + Region + ":000000000000:stack/" + name + "/" + requestID()
		}
		if st.CreationTime.IsZero() {
			st.CreationTime = now()
		}
		a.Stacks[name] = st
	}
	return nil
}

type xmlStack struct {
	StackName    string `xml:"StackName"`
	StackID      string `xml:"StackId"`
	StackStatus  string `xml:"StackStatus"`
	CreationTime string `xml:"CreationTime"`
}

func (a *CloudFormationAccount) describeStacks(c call) (any, *apiError) {
	name := c.form.Get("StackName")
	var names []string
	if name == "" {
		for n := range a.Stacks {
			names = append(names, n)
		}
		slices.Sort(names)
	} else {
		if _, ok := a.Stacks[name]; !ok {
			return nil, errf(http.StatusBadRequest, "ValidationError", "Stack with id %s does not exist", name)
		}
		names = []string{name}
	}
	out := make([]xmlStack, 0, len(names))
	for _, n := range names {
		st := a.Stacks[n]
		out = append(out, xmlStack{st.StackName, st.StackID, st.StackStatus, iso(st.CreationTime)})
	}
	return struct {
		Stacks []xmlStack `xml:"Stacks>member"`
	}{out}, nil
}
