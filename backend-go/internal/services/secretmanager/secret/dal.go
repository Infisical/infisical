package secret

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"
	"github.com/google/uuid"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/database/pg/gen/table"
)

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
	ID    uuid.UUID `sql:"primary_key" alias:"secret_tags.id"`
	Slug  string    `alias:"secret_tags.slug"`
	Color string    `alias:"secret_tags.color"`
}

type SecretMetadata struct {
	ID             uuid.UUID `sql:"primary_key" alias:"resource_metadata.id"`
	Key            string    `alias:"resource_metadata.key"`
	Value          string    `alias:"resource_metadata.value"`
	EncryptedValue []byte    `alias:"resource_metadata.encrypted_value"`
}

type ReminderRecipientUser struct {
	ID       uuid.UUID `sql:"primary_key" alias:"users.id"`
	Username string    `alias:"users.username"`
	Email    string    `alias:"users.email"`
}

type SecretReminderRecipient struct {
	ID   uuid.UUID             `sql:"primary_key" alias:"reminders_recipients.id"`
	User ReminderRecipientUser `alias:"users"`
}

type SecretRotationMapping struct {
	RotationID uuid.UUID `sql:"primary_key" alias:"secret_rotation_v2_secret_mappings.rotation_id"`
}

type Secret struct {
	ID                    uuid.UUID           `sql:"primary_key" alias:"secrets_v2.id"`
	Version               int32               `alias:"secrets_v2.version"`
	Type                  string              `alias:"secrets_v2.type"`
	Key                   string              `alias:"secrets_v2.key"`
	EncryptedValue        sql.Null[[]byte]    `alias:"secrets_v2.encrypted_value"`
	EncryptedComment      sql.Null[[]byte]    `alias:"secrets_v2.encrypted_comment"`
	SkipMultilineEncoding sql.Null[bool]      `alias:"secrets_v2.skip_multiline_encoding"`
	Metadata              sql.Null[string]    `alias:"secrets_v2.metadata"`
	UserID                sql.Null[uuid.UUID] `alias:"secrets_v2.user_id"`
	FolderID              uuid.UUID           `alias:"secrets_v2.folder_id"`
	CreatedAt             time.Time           `alias:"secrets_v2.created_at"`
	UpdatedAt             time.Time           `alias:"secrets_v2.updated_at"`

	Tags                     []SecretTag               `alias:"secret_tags"`
	SecretMetadata           []SecretMetadata          `alias:"resource_metadata"`
	SecretReminderRecipients []SecretReminderRecipient `alias:"reminders_recipients"`
	RotationMapping          []SecretRotationMapping   `alias:"secret_rotation_v2_secret_mappings"`
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

type DAL struct {
	db pg.DB
}

func NewDAL(db pg.DB) *DAL {
	return &DAL{db: db}
}

func (d *DAL) FindByFolderIds(
	ctx context.Context,
	folderIDs []uuid.UUID,
	userID *uuid.UUID,
	filters *FindByFolderIdsFilter,
) ([]Secret, error) {
	if len(folderIDs) == 0 {
		return []Secret{}, nil
	}

	secretsV2 := table.SecretsV2
	secretV2TagJunction := table.SecretV2TagJunction
	secretTags := table.SecretTags
	resourceMetadata := table.ResourceMetadata
	secretRotationV2SecretMappings := table.SecretRotationV2SecretMappings
	reminders := table.Reminders
	remindersRecipients := table.RemindersRecipients
	users := table.Users

	folderExpressions := make([]postgres.Expression, len(folderIDs))
	for i, id := range folderIDs {
		folderExpressions[i] = postgres.UUID(id)
	}

	orderDirection := OrderByDirectionASC
	if filters != nil && filters.OrderDirection != nil {
		orderDirection = *filters.OrderDirection
	}

	var orderByColumn postgres.OrderByClause
	if filters != nil && filters.OrderBy != nil && *filters.OrderBy == SecretsOrderByName {
		if orderDirection == OrderByDirectionDESC {
			orderByColumn = secretsV2.Key.DESC()
		} else {
			orderByColumn = secretsV2.Key.ASC()
		}
	} else {
		if orderDirection == OrderByDirectionDESC {
			orderByColumn = secretsV2.ID.DESC()
		} else {
			orderByColumn = secretsV2.ID.ASC()
		}
	}

	selectColumns := []postgres.Projection{
		secretsV2.ID,
		secretsV2.Version,
		secretsV2.Type,
		secretsV2.Key,
		secretsV2.EncryptedValue,
		secretsV2.EncryptedComment,
		secretsV2.SkipMultilineEncoding,
		secretsV2.Metadata,
		secretsV2.UserId,
		secretsV2.FolderId,
		secretsV2.CreatedAt,
		secretsV2.UpdatedAt,
		secretTags.ID,
		secretTags.Slug,
		secretTags.Color,
		resourceMetadata.ID,
		resourceMetadata.Key,
		resourceMetadata.Value,
		resourceMetadata.EncryptedValue,
		secretRotationV2SecretMappings.RotationId,
		remindersRecipients.ID,
		users.ID,
		users.Username,
		users.Email,
	}

	fromClause := secretsV2.
		LEFT_JOIN(secretV2TagJunction, secretsV2.ID.EQ(secretV2TagJunction.SecretsV2id)).
		LEFT_JOIN(secretTags, secretV2TagJunction.SecretTagsid.EQ(secretTags.ID)).
		LEFT_JOIN(resourceMetadata, secretsV2.ID.EQ(resourceMetadata.SecretId)).
		LEFT_JOIN(secretRotationV2SecretMappings, secretsV2.ID.EQ(secretRotationV2SecretMappings.SecretId)).
		LEFT_JOIN(reminders, secretsV2.ID.EQ(reminders.SecretId)).
		LEFT_JOIN(remindersRecipients, reminders.ID.EQ(remindersRecipients.ReminderId)).
		LEFT_JOIN(users, remindersRecipients.UserId.EQ(users.ID))

	var conditions []postgres.BoolExpression

	conditions = append(conditions, secretsV2.FolderId.IN(folderExpressions...))

	if filters != nil && filters.Search != "" {
		searchPattern := "%" + filters.Search + "%"
		searchConditions := []postgres.BoolExpression{
			secretsV2.Key.LIKE(postgres.String(searchPattern)),
		}
		if filters.IncludeTagsInSearch {
			searchConditions = append(searchConditions, secretTags.Slug.LIKE(postgres.String(searchPattern)))
		}
		if filters.IncludeMetadataInSearch {
			searchConditions = append(searchConditions,
				resourceMetadata.Key.LIKE(postgres.String(searchPattern)),
				resourceMetadata.Value.LIKE(postgres.String(searchPattern)),
			)
		}
		conditions = append(conditions, postgres.OR(searchConditions...))
	}

	if filters != nil && len(filters.Keys) > 0 {
		keyExpressions := make([]postgres.Expression, len(filters.Keys))
		for i, key := range filters.Keys {
			keyExpressions[i] = postgres.String(key)
		}
		conditions = append(conditions, secretsV2.Key.IN(keyExpressions...))
	}

	if userID == nil {
		conditions = append(conditions, secretsV2.UserId.IS_NULL())
	} else {
		conditions = append(conditions, postgres.OR(
			secretsV2.UserId.IS_NULL(),
			secretsV2.UserId.EQ(postgres.UUID(*userID)),
		))
	}

	if filters != nil && len(filters.MetadataFilter) > 0 {
		for _, meta := range filters.MetadataFilter {
			subQuery := postgres.SELECT(resourceMetadata.SecretId).
				FROM(resourceMetadata).
				WHERE(postgres.AND(
					resourceMetadata.SecretId.EQ(secretsV2.ID),
					resourceMetadata.Key.EQ(postgres.String(meta.Key)),
					resourceMetadata.Value.EQ(postgres.String(meta.Value)),
					resourceMetadata.Value.IS_NOT_NULL(),
				))
			conditions = append(conditions, postgres.EXISTS(subQuery))
		}
	}

	if filters != nil && len(filters.TagSlugs) > 0 {
		var validSlugs []string
		for _, slug := range filters.TagSlugs {
			if slug != "" {
				validSlugs = append(validSlugs, slug)
			}
		}
		if len(validSlugs) > 0 {
			slugExpressions := make([]postgres.Expression, len(validSlugs))
			for i, slug := range validSlugs {
				slugExpressions[i] = postgres.String(slug)
			}
			conditions = append(conditions, secretTags.Slug.IN(slugExpressions...))
		}
	}

	if filters != nil && filters.ExcludeRotatedSecrets {
		conditions = append(conditions, secretRotationV2SecretMappings.SecretId.IS_NULL())
	}

	stmt := postgres.SELECT(selectColumns[0], selectColumns[1:]...).
		FROM(fromClause).
		WHERE(postgres.AND(conditions...)).
		ORDER_BY(orderByColumn)

	var secrets []Secret

	if filters != nil && filters.Limit != nil {
		offset := 0
		if filters.Offset != nil {
			offset = *filters.Offset
		}
		stmt = stmt.LIMIT(int64(*filters.Limit)).OFFSET(int64(offset))
	}

	err := stmt.QueryContext(ctx, d.db.Replica(), &secrets)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return []Secret{}, nil
		}
		return nil, fmt.Errorf("FindByFolderIds query: %w", err)
	}

	return secrets, nil
}
