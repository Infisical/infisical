package aws

import (
	"encoding/json"
	"maps"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// SecretsStore is one account's Secrets Manager secrets in the served region.
type SecretsStore struct {
	Policy
	Secrets map[string]*Secret `json:"secrets"`

	mu     sync.Mutex
	events fakenet.Emitter
	h      handler
}

// Secret is keyed by its name. A secret deleted with a recovery window stays here with
// DeletedDate set, as it does in AWS, until the window passes.
type Secret struct {
	Name         string            `json:"name"`
	ARN          string            `json:"arn"`
	SecretString string            `json:"secretString"`
	KmsKeyID     string            `json:"kmsKeyId,omitempty"`
	VersionID    string            `json:"versionId"`
	Tags         map[string]string `json:"tags,omitempty"`
	CreatedDate  time.Time         `json:"createdDate"`
	LastChanged  time.Time         `json:"lastChangedDate"`
	DeletedDate  *time.Time        `json:"deletedDate,omitempty"`
}

const (
	smMaxList       = 100
	smMaxBatch      = 20
	smMaxNameLength = 512
	smMaxValueBytes = 65536
)

func newSecretsManager(svc service, events fakenet.Emitter) fakenet.Fake {
	sm := &SecretsStore{Secrets: map[string]*Secret{}, events: events}
	sm.h = handler{svc: svc, mu: &sm.mu, policy: func() *Policy { return &sm.Policy }, actions: map[string]func(call) (any, *apiError){
		"ListSecrets":         sm.listSecrets,
		"BatchGetSecretValue": sm.batchGetSecretValue,
		"DescribeSecret":      sm.describeSecret,
		"GetSecretValue":      sm.getSecretValue,
		"CreateSecret":        sm.createSecret,
		"UpdateSecret":        sm.updateSecret,
		"DeleteSecret":        sm.deleteSecret,
		"TagResource":         sm.tagResource,
		"UntagResource":       sm.untagResource,
	}}
	return sm
}

func (sm *SecretsStore) ServeHTTP(w http.ResponseWriter, r *http.Request) { sm.h.serve(w, r) }

func (sm *SecretsStore) Snapshot() ([]byte, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	return json.Marshal(struct {
		Policy
		Secrets map[string]*Secret `json:"secrets"`
	}{sm.Policy, sm.Secrets})
}

// Seed merges secrets that exist before Infisical touches the store, without the API's
// validation: a seed is whatever someone else put there.
func (sm *SecretsStore) Seed(raw []byte) error {
	var in struct {
		Policy
		Secrets map[string]*Secret `json:"secrets"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.merge(in.Policy)
	for name, s := range in.Secrets {
		s.Name = name
		if s.ARN == "" {
			s.ARN = "arn:aws:secretsmanager:" + Region + ":000000000000:secret:" + name + "-" + randomBase32(6)
		}
		if s.VersionID == "" {
			s.VersionID = requestID()
		}
		if s.CreatedDate.IsZero() {
			s.CreatedDate = now()
		}
		if s.LastChanged.IsZero() {
			s.LastChanged = s.CreatedDate
		}
		sm.Secrets[name] = s
	}
	return nil
}

var secretNamePattern = regexp.MustCompile(`^[a-zA-Z0-9/_+=.@\-]+$`)

func notFound() *apiError {
	return errf(http.StatusBadRequest, "ResourceNotFoundException", "Secrets Manager can't find the specified secret.")
}

// find resolves a SecretId, which may be the name or the ARN.
func (sm *SecretsStore) find(id string) (*Secret, *apiError) {
	if s, ok := sm.Secrets[id]; ok {
		return s, nil
	}
	for _, s := range sm.Secrets {
		if s.ARN == id {
			return s, nil
		}
	}
	return nil, notFound()
}

func (sm *SecretsStore) live(id string) (*Secret, *apiError) {
	s, err := sm.find(id)
	if err != nil {
		return nil, err
	}
	if s.DeletedDate != nil {
		return nil, errf(http.StatusBadRequest, "InvalidRequestException",
			"You can't perform this operation on the secret because it was marked for deletion.")
	}
	return s, nil
}

func tagList(tags map[string]string) []tag {
	keys := slices.Sorted(maps.Keys(tags))
	out := make([]tag, 0, len(keys))
	for _, k := range keys {
		out = append(out, tag{Key: k, Value: tags[k]})
	}
	return out
}

func (sm *SecretsStore) entry(s *Secret) map[string]any {
	out := map[string]any{
		"ARN":             s.ARN,
		"Name":            s.Name,
		"Tags":            tagList(s.Tags),
		"CreatedDate":     epoch(s.CreatedDate),
		"LastChangedDate": epoch(s.LastChanged),
		"SecretVersionsToStages": map[string][]string{
			s.VersionID: {"AWSCURRENT"},
		},
	}
	if s.KmsKeyID != "" {
		out["KmsKeyId"] = s.KmsKeyID
	}
	if s.DeletedDate != nil {
		out["DeletedDate"] = epoch(*s.DeletedDate)
	}
	return out
}

func (sm *SecretsStore) listSecrets(c call) (any, *apiError) {
	var in struct {
		MaxResults             *int
		NextToken              string
		IncludePlannedDeletion bool
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	limit, err := maxResults(in.MaxResults, smMaxList, smMaxList, "maxResults")
	if err != nil {
		return nil, err
	}
	var names []string
	for name, s := range sm.Secrets {
		if s.DeletedDate == nil || in.IncludePlannedDeletion {
			names = append(names, name)
		}
	}
	got, next, err := page(names, in.NextToken, limit)
	if err != nil {
		return nil, err
	}
	list := make([]map[string]any, 0, len(got))
	for _, name := range got {
		list = append(list, sm.entry(sm.Secrets[name]))
	}
	res := map[string]any{"SecretList": list}
	if next != "" {
		res["NextToken"] = next
	}
	return res, nil
}

func (sm *SecretsStore) value(s *Secret) map[string]any {
	return map[string]any{
		"ARN":           s.ARN,
		"Name":          s.Name,
		"VersionId":     s.VersionID,
		"SecretString":  s.SecretString,
		"VersionStages": []string{"AWSCURRENT"},
		"CreatedDate":   epoch(s.LastChanged),
	}
}

func (sm *SecretsStore) batchGetSecretValue(c call) (any, *apiError) {
	var in struct{ SecretIdList []string }
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	if len(in.SecretIdList) < 1 || len(in.SecretIdList) > smMaxBatch {
		return nil, errf(http.StatusBadRequest, "InvalidParameterException",
			"SecretIdList must contain between 1 and 20 secret IDs.")
	}
	values, errs := []map[string]any{}, []map[string]any{}
	for _, id := range in.SecretIdList {
		s, err := sm.live(id)
		if err != nil {
			errs = append(errs, map[string]any{"SecretId": id, "ErrorCode": err.code, "Message": err.message})
			continue
		}
		values = append(values, sm.value(s))
	}
	return map[string]any{"SecretValues": values, "Errors": errs}, nil
}

func (sm *SecretsStore) describeSecret(c call) (any, *apiError) {
	var in struct{ SecretId string }
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	s, err := sm.find(in.SecretId)
	if err != nil {
		return nil, err
	}
	return sm.entry(s), nil
}

func (sm *SecretsStore) getSecretValue(c call) (any, *apiError) {
	var in struct{ SecretId string }
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	s, err := sm.live(in.SecretId)
	if err != nil {
		return nil, err
	}
	return sm.value(s), nil
}

func validateSecretValue(v *string) *apiError {
	if v != nil && len(*v) > smMaxValueBytes {
		return errf(http.StatusBadRequest, "InvalidParameterException",
			"The SecretString parameter exceeds the maximum size of 65536 bytes.")
	}
	return nil
}

func (sm *SecretsStore) createSecret(c call) (any, *apiError) {
	var in struct {
		Name         string
		SecretString *string
		KmsKeyId     string
		Tags         []tag
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	if in.Name == "" || len(in.Name) > smMaxNameLength || !secretNamePattern.MatchString(in.Name) {
		return nil, errf(http.StatusBadRequest, "ValidationException",
			"Invalid name. Must be a valid name containing alphanumeric characters, or any of the following: -/_+=.@!")
	}
	if err := validateSecretValue(in.SecretString); err != nil {
		return nil, err
	}
	if existing, ok := sm.Secrets[in.Name]; ok {
		if existing.DeletedDate != nil {
			return nil, errf(http.StatusBadRequest, "InvalidRequestException",
				"You can't create this secret because a secret with this name is already scheduled for deletion.")
		}
		return nil, errf(http.StatusBadRequest, "ResourceExistsException",
			"The operation failed because the secret %s already exists.", in.Name)
	}

	at := now()
	s := &Secret{
		Name:        in.Name,
		ARN:         "arn:aws:secretsmanager:" + c.svc.region + ":" + c.account() + ":secret:" + in.Name + "-" + randomBase32(6),
		KmsKeyID:    in.KmsKeyId,
		VersionID:   requestID(),
		CreatedDate: at,
		LastChanged: at,
	}
	if in.SecretString != nil {
		s.SecretString = *in.SecretString
	}
	if len(in.Tags) > 0 {
		s.Tags = map[string]string{}
		for _, t := range in.Tags {
			s.Tags[t.Key] = t.Value
		}
	}
	sm.Secrets[in.Name] = s
	sm.events.Publish(SecretCreated{SecretDetail{Name: s.Name}})
	return map[string]any{"ARN": s.ARN, "Name": s.Name, "VersionId": s.VersionID}, nil
}

func (sm *SecretsStore) updateSecret(c call) (any, *apiError) {
	var in struct {
		SecretId     string
		SecretString *string
		KmsKeyId     *string
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	s, err := sm.live(in.SecretId)
	if err != nil {
		return nil, err
	}
	if err := validateSecretValue(in.SecretString); err != nil {
		return nil, err
	}
	if in.KmsKeyId != nil {
		s.KmsKeyID = *in.KmsKeyId
	}
	out := map[string]any{"ARN": s.ARN, "Name": s.Name}
	if in.SecretString != nil {
		s.SecretString = *in.SecretString
		s.VersionID = requestID()
		out["VersionId"] = s.VersionID
	}
	s.LastChanged = now()
	sm.events.Publish(SecretUpdated{SecretDetail{Name: s.Name}})
	return out, nil
}

func (sm *SecretsStore) deleteSecret(c call) (any, *apiError) {
	var in struct {
		SecretId                   string
		ForceDeleteWithoutRecovery bool
		RecoveryWindowInDays       *int
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	if in.ForceDeleteWithoutRecovery && in.RecoveryWindowInDays != nil {
		return nil, errf(http.StatusBadRequest, "InvalidParameterException",
			"You can't use ForceDeleteWithoutRecovery in conjunction with RecoveryWindowInDays.")
	}
	s, err := sm.find(in.SecretId)
	if err != nil {
		return nil, err
	}
	at := now()
	if in.ForceDeleteWithoutRecovery {
		delete(sm.Secrets, s.Name)
	} else {
		days := 30
		if in.RecoveryWindowInDays != nil {
			days = *in.RecoveryWindowInDays
		}
		at = at.AddDate(0, 0, days)
		s.DeletedDate = &at
	}
	sm.events.Publish(SecretDeleted{SecretDetail{Name: s.Name}})
	return map[string]any{"ARN": s.ARN, "Name": s.Name, "DeletionDate": epoch(at)}, nil
}

func (sm *SecretsStore) tagResource(c call) (any, *apiError) {
	var in struct {
		SecretId string
		Tags     []tag
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	s, err := sm.live(in.SecretId)
	if err != nil {
		return nil, err
	}
	tags := maps.Clone(s.Tags)
	if tags == nil {
		tags = map[string]string{}
	}
	for _, t := range in.Tags {
		tags[t.Key] = t.Value
	}
	if len(tags) > 50 {
		return nil, errf(http.StatusBadRequest, "ValidationException", "Number of tags exceeds the limit of 50.")
	}
	s.Tags = tags
	sm.events.Publish(SecretTagged{SecretDetail{Name: s.Name}})
	return struct{}{}, nil
}

func (sm *SecretsStore) untagResource(c call) (any, *apiError) {
	var in struct {
		SecretId string
		TagKeys  []string
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	s, err := sm.live(in.SecretId)
	if err != nil {
		return nil, err
	}
	for _, k := range in.TagKeys {
		delete(s.Tags, strings.TrimSpace(k))
	}
	sm.events.Publish(SecretUntagged{SecretDetail{Name: s.Name}})
	return struct{}{}, nil
}
