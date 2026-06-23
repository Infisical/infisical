package secret

import (
	"context"
	"database/sql"
	"log/slog"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/database/pg/qb"
	"github.com/infisical/api/internal/database/pg/sqln"
	"github.com/infisical/api/internal/libs/fn"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/secrets/secretfolder"
	"github.com/infisical/api/internal/services/secrets/secretimport"
)

const secretValueHiddenMask = "<hidden-by-infisical>"

// --- Data types ---

type OrderByDirection string

const (
	OrderByDirectionASC  OrderByDirection = "asc"
	OrderByDirectionDESC OrderByDirection = "desc"
)

type SecretsOrderBy string

const (
	SecretsOrderByName SecretsOrderBy = "name"
)

type SecretTag struct {
	ID    uuid.UUID
	Slug  string
	Color sql.Null[string]
}

type SecretMetadata struct {
	ID             uuid.UUID
	Key            string
	Value          string
	EncryptedValue []byte
}

type ReminderRecipientUser struct {
	ID       uuid.UUID
	Username string
	Email    string
}

type SecretReminderRecipient struct {
	ID   uuid.UUID
	User ReminderRecipientUser
}

type SecretRotationMapping struct {
	RotationID uuid.UUID
}

type Secret struct {
	ID                    uuid.UUID
	Version               int32
	Type                  string
	Key                   string
	EncryptedValue        sql.Null[[]byte]
	EncryptedComment      sql.Null[[]byte]
	SkipMultilineEncoding sql.Null[bool]
	Metadata              sql.Null[string]
	UserID                sql.Null[uuid.UUID]
	FolderID              uuid.UUID
	CreatedAt             time.Time
	UpdatedAt             time.Time
	ReminderNote          sql.Null[string]
	ReminderRepeatDays    sql.Null[int32]

	Tags                     []SecretTag
	SecretMetadata           []SecretMetadata
	SecretReminderRecipients []SecretReminderRecipient
	RotationMapping          []SecretRotationMapping
}

func (s *Secret) IsRotatedSecret() bool {
	return len(s.RotationMapping) > 0
}

func (s *Secret) GetRotationID() uuid.UUID {
	if len(s.RotationMapping) > 0 {
		return s.RotationMapping[0].RotationID
	}
	return uuid.Nil
}

type MetadataFilter struct {
	Key   string
	Value string
}

type FindByFolderIdsFilter struct {
	Limit                   *int
	Offset                  *int
	OrderBy                 *SecretsOrderBy
	OrderDirection          *OrderByDirection
	Search                  string
	TagSlugs                []string
	MetadataFilter          []MetadataFilter
	IncludeTagsInSearch     bool
	IncludeMetadataInSearch bool
	Keys                    []string
	ExcludeRotatedSecrets   bool
}

// accessChecker verifies if a user can access secrets at given locations.
// DecryptedMetadata holds a decrypted metadata entry.
type DecryptedMetadata struct {
	Key         string
	Value       string
	IsEncrypted bool
}

// ProcessedSecret holds a secret with its computed metadata.
type ProcessedSecret struct {
	Secret            *Secret
	SecretPath        string
	Environment       string
	RawValue          string // original decrypted value, never mutated after set
	Value             string // final value (= RawValue initially, expanded if requested)
	Comment           string
	Metadata          []DecryptedMetadata
	ValueHidden       bool
	IsImported        bool
	ImportFolderID    uuid.UUID
	ImportEnvironment string
	ImportPath        string
}

// --- Dependency Interfaces ---

// SecretFolderService loads folder hierarchies for a project.
type SecretFolderService interface {
	LoadFolders(ctx context.Context, projectID string, envIDs []uuid.UUID) (*secretfolder.FolderLookup, error)
}

// SecretImportService loads import configurations for a project.
type SecretImportService interface {
	LoadProjectImports(ctx context.Context, projectID string) (*secretimport.ImportLookup, error)
}

// KMSService creates cipher pairs for encryption/decryption.
type KMSService interface {
	CreateCipherPairWithProjectDataKey(ctx context.Context, projectID string) (*kms.CipherPair, error)
}

// --- Service ---

// Deps holds the dependencies for the secrets service.
type Deps struct {
	DB                  pg.DB
	SecretFolderService SecretFolderService
	SecretImportService SecretImportService
	KMSService          KMSService
}

// Service handles secret retrieval with decryption and expansion.
type Service struct {
	logger              *slog.Logger
	db                  pg.DB
	secretFolderService SecretFolderService
	secretImportService SecretImportService
	kmsService          KMSService
}

// NewService creates a new secrets service.
func NewService(_ context.Context, logger *slog.Logger, deps *Deps) *Service {
	return &Service{
		logger:              logger.With(slog.String("service", "secrets")),
		db:                  deps.DB,
		secretFolderService: deps.SecretFolderService,
		secretImportService: deps.SecretImportService,
		kmsService:          deps.KMSService,
	}
}

// --- Data Access Methods ---

var secretGrouper = sqln.Grouper[Secret, uuid.UUID]{
	Key: func(s *Secret) uuid.UUID { return s.ID },
	Merge: func(existing, row *Secret) {
		if len(row.Tags) > 0 {
			existing.Tags = fn.AppendUnique(existing.Tags, row.Tags[0], func(t SecretTag) uuid.UUID { return t.ID })
		}
		if len(row.SecretMetadata) > 0 {
			existing.SecretMetadata = fn.AppendUnique(existing.SecretMetadata, row.SecretMetadata[0], func(m SecretMetadata) uuid.UUID { return m.ID })
		}
		if len(row.SecretReminderRecipients) > 0 {
			existing.SecretReminderRecipients = fn.AppendUnique(existing.SecretReminderRecipients, row.SecretReminderRecipients[0], func(r SecretReminderRecipient) uuid.UUID { return r.ID })
		}
		if len(row.RotationMapping) > 0 {
			existing.RotationMapping = fn.AppendUnique(existing.RotationMapping, row.RotationMapping[0], func(r SecretRotationMapping) uuid.UUID { return r.RotationID })
		}
	},
}

func (s *Service) FindByFolderIds(
	ctx context.Context,
	folderIDs []uuid.UUID,
	userID *uuid.UUID,
	filters *FindByFolderIdsFilter,
) ([]Secret, error) {
	if len(folderIDs) == 0 {
		return []Secret{}, nil
	}

	where := qb.NewWhere().Add(`secret."folderId" = ANY(@folderIDs)`)

	if userID == nil {
		where.Add(`secret."userId" IS NULL`)
	} else {
		where.Add(`(secret."userId" IS NULL OR secret."userId" = @userID)`)
	}

	if filters != nil {
		if filters.Search != "" {
			searchCond := "secret.key ILIKE @searchPattern"
			if filters.IncludeTagsInSearch {
				searchCond = "(" + searchCond + " OR tag.slug ILIKE @searchPattern)"
			}
			if filters.IncludeMetadataInSearch {
				searchCond = "(" + searchCond + " OR meta.key ILIKE @searchPattern OR meta.value ILIKE @searchPattern)"
			}
			where.Add(searchCond)
		}

		if len(filters.Keys) > 0 {
			where.Add("secret.key = ANY(@keys)")
		}

		if len(filters.TagSlugs) > 0 {
			where.Add("tag.slug = ANY(@tagSlugs)")
		}

		if filters.ExcludeRotatedSecrets {
			where.Add(`rotationMapping."secretId" IS NULL`)
		}

		for i := range filters.MetadataFilter {
			idx := strconv.Itoa(i)
			where.Add(`EXISTS (SELECT 1 FROM resource_metadata metaSub WHERE metaSub."secretId" = secret.id AND metaSub.key = @metaKey` + idx + " AND metaSub.value = @metaValue" + idx + " AND metaSub.value IS NOT NULL)")
		}
	}

	// Build ORDER BY clause with orthogonal column and direction selection
	// Include secondary ordering by createdAt for deterministic results with LEFT JOINs
	orderCol, orderDir := "secret.key", "ASC"
	if filters != nil {
		if filters.OrderDirection != nil && *filters.OrderDirection == OrderByDirectionDESC {
			orderDir = "DESC"
		}
	}
	orderBy := orderCol + " " + orderDir + `, meta."createdAt" ASC NULLS FIRST, meta.id ASC NULLS FIRST, tag."createdAt" ASC NULLS FIRST, tag.id ASC NULLS FIRST`

	limitClause := ""
	if filters != nil && filters.Limit != nil {
		limitClause = " LIMIT @limit OFFSET @offset"
	}

	query := `
		SELECT
			secret.id, secret.version, secret.type, secret.key, secret."encryptedValue", secret."encryptedComment",
			secret."skipMultilineEncoding", secret.metadata, secret."userId", secret."folderId", secret."createdAt", secret."updatedAt",
			tag.id AS tag_id, tag.slug AS tag_slug, tag.color AS tag_color,
			meta.id AS meta_id, meta.key AS meta_key, meta.value AS meta_value, meta."encryptedValue" AS meta_encrypted_value,
			rotationMapping."rotationId",
			reminder.message AS reminder_note, reminder."repeatDays" AS reminder_repeat_days,
			recipient.id AS recipient_id, recipientUser.id AS recipient_user_id, recipientUser.username AS recipient_username, recipientUser.email AS recipient_email
		FROM secrets_v2 secret
		LEFT JOIN secret_v2_tag_junction tagJunction ON secret.id = tagJunction."secrets_v2Id"
		LEFT JOIN secret_tags tag ON tagJunction."secret_tagsId" = tag.id
		LEFT JOIN resource_metadata meta ON secret.id = meta."secretId"
		LEFT JOIN secret_rotation_v2_secret_mappings rotationMapping ON secret.id = rotationMapping."secretId"
		LEFT JOIN reminders reminder ON secret.id = reminder."secretId"
		LEFT JOIN reminders_recipients recipient ON reminder.id = recipient."reminderId"
		LEFT JOIN users recipientUser ON recipient."userId" = recipientUser.id
		WHERE ` + where.String() + `
		ORDER BY ` + orderBy + limitClause

	args := pgx.NamedArgs{
		"folderIDs": folderIDs,
		"userID":    userID,
	}

	if filters != nil {
		if filters.Search != "" {
			args["searchPattern"] = "%" + filters.Search + "%"
		}
		if len(filters.Keys) > 0 {
			args["keys"] = filters.Keys
		}
		if len(filters.TagSlugs) > 0 {
			args["tagSlugs"] = filters.TagSlugs
		}
		if filters.Limit != nil {
			args["limit"] = *filters.Limit
			offset := 0
			if filters.Offset != nil {
				offset = *filters.Offset
			}
			args["offset"] = offset
		}
		for i, meta := range filters.MetadataFilter {
			idx := strconv.Itoa(i)
			args["metaKey"+idx] = meta.Key
			args["metaValue"+idx] = meta.Value
		}
	}

	rows, err := s.db.Replica().Query(ctx, query, args)
	if err != nil {
		return nil, err
	}

	flatSecrets, err := pgx.CollectRows(rows, scanSecretRow)
	if err != nil {
		return nil, err
	}

	if len(flatSecrets) == 0 {
		return []Secret{}, nil
	}

	return sqln.GroupRows(flatSecrets, secretGrouper), nil
}

// findByKeyConfig holds the optional behavior for FindByKey.
type findByKeyConfig struct {
	secretType string // "shared" (default) or "personal"
	userID     *uuid.UUID
	version    *int // when set, the secret is read from secret_versions_v2
}

// FindByKeyOption configures an optional FindByKey lookup behavior.
type FindByKeyOption func(*findByKeyConfig)

// WithPersonalType scopes the lookup to the given user's personal secret instead
// of the shared secret.
func WithPersonalType(userID uuid.UUID) FindByKeyOption {
	return func(c *findByKeyConfig) {
		c.secretType = "personal"
		c.userID = &userID
	}
}

// WithVersion reads a historical version from secret_versions_v2 instead of the
// live secret. Returns nil when that version does not exist.
func WithVersion(version int) FindByKeyOption {
	return func(c *findByKeyConfig) {
		c.version = &version
	}
}

// FindByKey returns a secret by folder + key, or nil if not found. By default it
// reads the live shared secret; use WithPersonalType / WithVersion to scope the
// lookup. The version branch (secret_versions_v2) selects the same column shape
func (s *Service) FindByKey(ctx context.Context, folderID uuid.UUID, key string, opts ...FindByKeyOption) (*Secret, error) {
	cfg := findByKeyConfig{secretType: "shared"}
	for _, opt := range opts {
		opt(&cfg)
	}

	args := pgx.NamedArgs{
		"folderID":   folderID,
		"key":        key,
		"secretType": cfg.secretType,
		"userID":     cfg.userID,
	}

	var query string
	if cfg.version != nil {
		args["version"] = *cfg.version

		where := qb.NewWhere().
			Add(`sv."folderId" = @folderID`).
			Add("sv.key = @key").
			Add("sv.type = @secretType").
			Add("sv.version = @version")
		if cfg.secretType == "personal" && cfg.userID != nil {
			where.Add(`sv."userId" = @userID`)
		} else {
			where.Add(`sv."userId" IS NULL`)
		}

		query = `
			SELECT
				sv."secretId" AS id, sv.version, sv.type, sv.key, sv."encryptedValue", sv."encryptedComment",
				sv."skipMultilineEncoding", sv.metadata, sv."userId", sv."folderId", sv."createdAt", sv."updatedAt",
				tag.id AS tag_id, tag.slug AS tag_slug, tag.color AS tag_color,
				NULL::uuid AS meta_id, NULL::text AS meta_key, NULL::text AS meta_value, NULL::bytea AS meta_encrypted_value,
				NULL::uuid AS "rotationId",
				sv."reminderNote" AS reminder_note, sv."reminderRepeatDays" AS reminder_repeat_days,
				NULL::uuid AS recipient_id, NULL::uuid AS recipient_user_id, NULL::text AS recipient_username, NULL::text AS recipient_email
			FROM secret_versions_v2 sv
			LEFT JOIN secret_version_v2_tag_junction tagJunction ON sv.id = tagJunction."secret_versions_v2Id"
			LEFT JOIN secret_tags tag ON tagJunction."secret_tagsId" = tag.id
			WHERE ` + where.String() + `
			ORDER BY tag."createdAt" ASC NULLS FIRST, tag.id ASC NULLS FIRST`
	} else {
		where := qb.NewWhere().
			Add(`secret."folderId" = @folderID`).
			Add("secret.key = @key").
			Add("secret.type = @secretType")
		if cfg.secretType == "personal" && cfg.userID != nil {
			where.Add(`secret."userId" = @userID`)
		} else {
			where.Add(`secret."userId" IS NULL`)
		}

		query = `
			SELECT
				secret.id, secret.version, secret.type, secret.key, secret."encryptedValue", secret."encryptedComment",
				secret."skipMultilineEncoding", secret.metadata, secret."userId", secret."folderId", secret."createdAt", secret."updatedAt",
				tag.id AS tag_id, tag.slug AS tag_slug, tag.color AS tag_color,
				meta.id AS meta_id, meta.key AS meta_key, meta.value AS meta_value, meta."encryptedValue" AS meta_encrypted_value,
				rotationMapping."rotationId",
				reminder.message AS reminder_note, reminder."repeatDays" AS reminder_repeat_days,
				recipient.id AS recipient_id, recipientUser.id AS recipient_user_id, recipientUser.username AS recipient_username, recipientUser.email AS recipient_email
			FROM secrets_v2 secret
			LEFT JOIN secret_v2_tag_junction tagJunction ON secret.id = tagJunction."secrets_v2Id"
			LEFT JOIN secret_tags tag ON tagJunction."secret_tagsId" = tag.id
			LEFT JOIN resource_metadata meta ON secret.id = meta."secretId"
			LEFT JOIN secret_rotation_v2_secret_mappings rotationMapping ON secret.id = rotationMapping."secretId"
			LEFT JOIN reminders reminder ON secret.id = reminder."secretId"
			LEFT JOIN reminders_recipients recipient ON reminder.id = recipient."reminderId"
			LEFT JOIN users recipientUser ON recipient."userId" = recipientUser.id
			WHERE ` + where.String() + `
			ORDER BY meta."createdAt" ASC NULLS FIRST, meta.id ASC NULLS FIRST, tag."createdAt" ASC NULLS FIRST, tag.id ASC NULLS FIRST`
	}

	rows, err := s.db.Replica().Query(ctx, query, args)
	if err != nil {
		return nil, err
	}

	flatSecrets, err := pgx.CollectRows(rows, scanSecretRow)
	if err != nil {
		return nil, err
	}

	if len(flatSecrets) == 0 {
		return nil, nil
	}

	grouped := sqln.GroupRows(flatSecrets, secretGrouper)
	return &grouped[0], nil
}

func scanSecretRow(row pgx.CollectableRow) (Secret, error) {
	var (
		id                    uuid.UUID
		version               int32
		secretType            string
		key                   string
		encryptedValue        sql.Null[[]byte]
		encryptedComment      sql.Null[[]byte]
		skipMultilineEncoding sql.Null[bool]
		metadata              sql.Null[string]
		userID                sql.Null[uuid.UUID]
		folderID              uuid.UUID
		createdAt             time.Time
		updatedAt             time.Time
		tagID                 sql.Null[uuid.UUID]
		tagSlug               sql.Null[string]
		tagColor              sql.Null[string]
		metaID                sql.Null[uuid.UUID]
		metaKey               sql.Null[string]
		metaValue             sql.Null[string]
		metaEncryptedValue    []byte
		rotationID            sql.Null[uuid.UUID]
		reminderNote          sql.Null[string]
		reminderRepeatDays    sql.Null[int32]
		recipientID           sql.Null[uuid.UUID]
		recipientUserID       sql.Null[uuid.UUID]
		recipientUsername     sql.Null[string]
		recipientEmail        sql.Null[string]
	)

	if err := row.Scan(
		&id, &version, &secretType, &key, &encryptedValue, &encryptedComment,
		&skipMultilineEncoding, &metadata, &userID, &folderID, &createdAt, &updatedAt,
		&tagID, &tagSlug, &tagColor,
		&metaID, &metaKey, &metaValue, &metaEncryptedValue,
		&rotationID,
		&reminderNote, &reminderRepeatDays,
		&recipientID, &recipientUserID, &recipientUsername, &recipientEmail,
	); err != nil {
		return Secret{}, err
	}

	secret := Secret{
		ID:                    id,
		Version:               version,
		Type:                  secretType,
		Key:                   key,
		EncryptedValue:        encryptedValue,
		EncryptedComment:      encryptedComment,
		SkipMultilineEncoding: skipMultilineEncoding,
		Metadata:              metadata,
		UserID:                userID,
		FolderID:              folderID,
		CreatedAt:             createdAt,
		UpdatedAt:             updatedAt,
		ReminderNote:          reminderNote,
		ReminderRepeatDays:    reminderRepeatDays,
	}

	if tagID.Valid {
		secret.Tags = []SecretTag{{
			ID:    tagID.V,
			Slug:  tagSlug.V,
			Color: tagColor,
		}}
	}

	if metaID.Valid {
		secret.SecretMetadata = []SecretMetadata{{
			ID:             metaID.V,
			Key:            metaKey.V,
			Value:          metaValue.V,
			EncryptedValue: metaEncryptedValue,
		}}
	}

	if rotationID.Valid {
		secret.RotationMapping = []SecretRotationMapping{{
			RotationID: rotationID.V,
		}}
	}

	if recipientID.Valid {
		secret.SecretReminderRecipients = []SecretReminderRecipient{{
			ID: recipientID.V,
			User: ReminderRecipientUser{
				ID:       recipientUserID.V,
				Username: recipientUsername.V,
				Email:    recipientEmail.V,
			},
		}}
	}

	return secret, nil
}

// --- Decryption Helpers ---

// DecryptErrors holds any errors encountered during secret field decryption.
// Decryption uses fail-open semantics: fields that fail to decrypt are left empty
// but errors are collected for logging.
type DecryptErrors struct {
	ValueErr    error
	CommentErr  error
	MetadataErr error
}

// HasErrors returns true if any decryption errors occurred.
func (e *DecryptErrors) HasErrors() bool {
	return e.ValueErr != nil || e.CommentErr != nil || e.MetadataErr != nil
}

// ResolvedImport is a resolved import with folder ID. Re-exported from secretimport.
type ResolvedImport = secretimport.ResolvedImport

// ImportLookup provides import chain resolution. Re-exported from secretimport.
type ImportLookup = secretimport.ImportLookup

// LoadProjectImports loads all imports for a project.
func (s *Service) LoadProjectImports(ctx context.Context, projectID string) (*secretimport.ImportLookup, error) {
	return s.secretImportService.LoadProjectImports(ctx, projectID)
}

// DecryptSecretFields decrypts the value, comment, and metadata of a secret.
// If valueHidden is true, the displayValue is replaced with the hidden mask.
// Returns rawValue (actual decrypted), displayValue (masked if hidden), comment, metadata,
// and any decryption errors encountered (callers should log these).
func DecryptSecretFields(sec *Secret, cipherPair *kms.CipherPair, valueHidden bool) (rawValue, displayValue, comment string, metadata []DecryptedMetadata, decryptErrs *DecryptErrors) {
	decryptErrs = &DecryptErrors{}

	// Decrypt value
	if sec.EncryptedValue.Valid && len(sec.EncryptedValue.V) > 0 {
		if decrypted, err := cipherPair.Decrypt(sec.EncryptedValue.V); err != nil {
			decryptErrs.ValueErr = err
		} else {
			rawValue = string(decrypted)
		}
	}
	displayValue = rawValue
	if valueHidden {
		displayValue = secretValueHiddenMask
	}

	// Decrypt comment
	if sec.EncryptedComment.Valid && len(sec.EncryptedComment.V) > 0 {
		if decrypted, err := cipherPair.Decrypt(sec.EncryptedComment.V); err != nil {
			decryptErrs.CommentErr = err
		} else {
			comment = string(decrypted)
		}
	}

	// Decrypt metadata
	for _, m := range sec.SecretMetadata {
		metaValue := m.Value
		isEncrypted := len(m.EncryptedValue) > 0
		if isEncrypted {
			if decrypted, err := cipherPair.Decrypt(m.EncryptedValue); err != nil {
				if decryptErrs.MetadataErr == nil {
					decryptErrs.MetadataErr = err
				}
			} else {
				metaValue = string(decrypted)
			}
		}
		metadata = append(metadata, DecryptedMetadata{
			Key:         m.Key,
			Value:       metaValue,
			IsEncrypted: isEncrypted,
		})
	}

	return rawValue, displayValue, comment, metadata, decryptErrs
}
