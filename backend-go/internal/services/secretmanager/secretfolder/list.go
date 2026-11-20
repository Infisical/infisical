package secretfolder

import (
	"context"
	"errors"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/infisical/api/internal/libs/errutil"
)

var folderNameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

const (
	folderColumns         = `id, name, version, "createdAt", "updatedAt", "envId", "parentId", "isReserved", description, "lastSecretModified"`
	prefixedFolderColumns = `c.id, c.name, c.version, c."createdAt", c."updatedAt", c."envId", c."parentId", c."isReserved", c.description, c."lastSecretModified"`

	// Resolves a path from the environment's root, one segment per recursion step. Reserved folders are
	// walked through, as Node's path lookup does.
	findFolderByPathSQL = `
		WITH RECURSIVE walk AS (
			SELECT id, 0 AS depth FROM secret_folders WHERE "envId" = @envID AND "parentId" IS NULL
			UNION ALL
			SELECT f.id, w.depth + 1
			FROM walk w
			JOIN secret_folders f ON f."parentId" = w.id AND f.name = (@segments::text[])[w.depth + 1]
			WHERE w.depth < cardinality(@segments::text[])
		)
		SELECT id FROM walk WHERE depth = cardinality(@segments::text[]) LIMIT 1`

	// Same filter and ordering as Node's findByMultiEnv for a single environment and parent.
	listChildrenSQL = `
		SELECT ` + folderColumns + `, NULL::text AS "relativePath"
		FROM secret_folders
		WHERE "parentId" = @parentID AND "envId" = @envID AND "isReserved" = false
		ORDER BY name COLLATE "en-x-icu" ASC`

	// Node walks the environment in memory (findByEnvsDeep), excludes reserved folders and their subtrees,
	// and sorts by depth, name, then id.
	listDescendantsSQL = `
		WITH RECURSIVE tree AS (
			SELECT ` + folderColumns + `, 1 AS depth, '/' || name AS path
			FROM secret_folders
			WHERE "parentId" = @parentID AND "envId" = @envID AND "isReserved" = false
			UNION ALL
			SELECT ` + prefixedFolderColumns + `, t.depth + 1, t.path || '/' || c.name
			FROM tree t
			JOIN secret_folders c ON c."parentId" = t.id
			WHERE c."isReserved" = false
		)
		SELECT ` + folderColumns + `, path AS "relativePath"
		FROM tree
		ORDER BY depth, name COLLATE "en-x-icu" ASC, id::text COLLATE "en-x-icu" ASC`
)

type ListFoldersOpts struct {
	ProjectID          string
	Environment        string
	Path               string
	Recursive          bool
	LastSecretModified *time.Time
}

// ListedFolder carries every secret_folders column. RelativePath is set only for recursive listings.
type ListedFolder struct {
	ID                 uuid.UUID
	Name               string
	Version            *int32
	CreatedAt          time.Time
	UpdatedAt          time.Time
	EnvID              uuid.UUID
	ParentID           *uuid.UUID
	IsReserved         *bool
	Description        *string
	LastSecretModified *time.Time
	RelativePath       *string
}

// ListFolders lists the folders under a path. Callers must have checked project access, which also
// excludes soft-deleted projects.
func (s *Service) ListFolders(ctx context.Context, opts *ListFoldersOpts) ([]ListedFolder, error) {
	var envID uuid.UUID
	err := s.db.Replica().QueryRow(ctx,
		`SELECT id FROM project_environments WHERE "projectId" = @projectID AND slug = @slug AND "deleteAfter" IS NULL`,
		pgx.NamedArgs{"projectID": opts.ProjectID, "slug": opts.Environment},
	).Scan(&envID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errutil.NotFound("Environment with slug '%s' not found", opts.Environment)
	}
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to get environment").WithErrf("ListFolders(projectId=%s, slug=%s): %w", opts.ProjectID, opts.Environment, err)
	}

	segments := make([]string, 0)
	for segment := range strings.SplitSeq(opts.Path, "/") {
		if segment == "" {
			continue
		}
		if !folderNameRegex.MatchString(segment) {
			return nil, errutil.BadRequest("Invalid secret path. Only alphanumeric characters, dashes, and underscores are allowed.")
		}
		segments = append(segments, segment)
	}

	var parentID uuid.UUID
	err = s.db.Replica().QueryRow(ctx, findFolderByPathSQL,
		pgx.NamedArgs{"envID": envID, "segments": segments},
	).Scan(&parentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return []ListedFolder{}, nil
	}
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to get folders").WithErrf("ListFolders(projectId=%s, path=%s): %w", opts.ProjectID, opts.Path, err)
	}

	query := listChildrenSQL
	if opts.Recursive {
		query = listDescendantsSQL
	}
	rows, err := s.db.Replica().Query(ctx, query, pgx.NamedArgs{"envID": envID, "parentID": parentID})
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to get folders").WithErrf("ListFolders(projectId=%s, path=%s): %w", opts.ProjectID, opts.Path, err)
	}
	listed, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (ListedFolder, error) {
		var f ListedFolder
		err := row.Scan(&f.ID, &f.Name, &f.Version, &f.CreatedAt, &f.UpdatedAt, &f.EnvID, &f.ParentID, &f.IsReserved, &f.Description, &f.LastSecretModified, &f.RelativePath)
		return f, err
	})
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to get folders").WithErrf("ListFolders(projectId=%s, path=%s): %w", opts.ProjectID, opts.Path, err)
	}

	if opts.LastSecretModified != nil {
		threshold := opts.LastSecretModified.Truncate(time.Millisecond)
		listed = slices.DeleteFunc(listed, func(f ListedFolder) bool {
			return f.LastSecretModified == nil || f.LastSecretModified.Truncate(time.Millisecond).Before(threshold)
		})
	}
	if listed == nil {
		listed = []ListedFolder{}
	}
	return listed, nil
}
