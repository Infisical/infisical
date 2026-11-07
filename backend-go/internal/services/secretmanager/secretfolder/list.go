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
	"golang.org/x/text/collate"
	"golang.org/x/text/language"

	"github.com/infisical/api/internal/libs/errutil"
)

var folderNameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

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

// ListFolders lists the folders under a path. Callers must have checked project access.
func (s *Service) ListFolders(ctx context.Context, opts *ListFoldersOpts) ([]ListedFolder, error) {
	envID, err := s.findActiveEnvironmentID(ctx, opts.ProjectID, opts.Environment)
	if err != nil {
		return nil, err
	}

	segments, err := parseFolderPath(opts.Path)
	if err != nil {
		return nil, err
	}

	all, err := s.loadEnvironmentFolders(ctx, envID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to get folders").WithErrf("ListFolders(projectId=%s): %w", opts.ProjectID, err)
	}

	children := make(map[uuid.UUID][]*ListedFolder)
	var root *ListedFolder
	for i := range all {
		f := &all[i]
		if f.ParentID == nil {
			if root == nil {
				root = f
			}
			continue
		}
		children[*f.ParentID] = append(children[*f.ParentID], f)
	}
	if root == nil {
		return []ListedFolder{}, nil
	}

	parent := root
	for _, segment := range segments {
		idx := slices.IndexFunc(children[parent.ID], func(f *ListedFolder) bool { return f.Name == segment })
		if idx < 0 {
			return []ListedFolder{}, nil
		}
		parent = children[parent.ID][idx]
	}

	collator := collate.New(language.English)
	var listed []ListedFolder
	if opts.Recursive {
		listed = listDescendants(children, parent, collator)
	} else {
		listed = listChildren(children, parent, collator)
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

func parseFolderPath(path string) ([]string, error) {
	segments := make([]string, 0)
	for segment := range strings.SplitSeq(path, "/") {
		if segment == "" {
			continue
		}
		if !folderNameRegex.MatchString(segment) {
			return nil, errutil.BadRequest("Invalid secret path. Only alphanumeric characters, dashes, and underscores are allowed.")
		}
		segments = append(segments, segment)
	}
	return segments, nil
}

func listChildren(children map[uuid.UUID][]*ListedFolder, parent *ListedFolder, collator *collate.Collator) []ListedFolder {
	direct := make([]ListedFolder, 0, len(children[parent.ID]))
	for _, child := range children[parent.ID] {
		if child.IsReserved != nil && *child.IsReserved {
			continue
		}
		direct = append(direct, *child)
	}
	slices.SortStableFunc(direct, func(a, b ListedFolder) int { return collator.CompareString(a.Name, b.Name) })
	return direct
}

func listDescendants(children map[uuid.UUID][]*ListedFolder, parent *ListedFolder, collator *collate.Collator) []ListedFolder {
	type walked struct {
		folder ListedFolder
		depth  int
	}
	var out []walked

	var walk func(folder *ListedFolder, path string, depth int)
	walk = func(folder *ListedFolder, path string, depth int) {
		for _, child := range children[folder.ID] {
			if child.IsReserved != nil && *child.IsReserved {
				continue
			}
			childPath := path + "/" + child.Name
			item := *child
			item.RelativePath = &childPath
			out = append(out, walked{folder: item, depth: depth})
			walk(child, childPath, depth+1)
		}
	}
	walk(parent, "", 1)

	slices.SortStableFunc(out, func(a, b walked) int {
		if a.depth != b.depth {
			return a.depth - b.depth
		}
		if c := collator.CompareString(a.folder.Name, b.folder.Name); c != 0 {
			return c
		}
		return collator.CompareString(a.folder.ID.String(), b.folder.ID.String())
	})

	listed := make([]ListedFolder, len(out))
	for i := range out {
		listed[i] = out[i].folder
	}
	return listed
}

func (s *Service) findActiveEnvironmentID(ctx context.Context, projectID, slug string) (uuid.UUID, error) {
	var id uuid.UUID
	err := s.db.Replica().QueryRow(ctx,
		`SELECT id FROM project_environments WHERE "projectId" = @projectID AND slug = @slug AND "deleteAfter" IS NULL`,
		pgx.NamedArgs{"projectID": projectID, "slug": slug},
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, errutil.NotFound("Environment with slug '%s' not found", slug)
	}
	if err != nil {
		return uuid.Nil, errutil.DatabaseErr("Failed to get environment").WithErrf("findActiveEnvironmentID(projectId=%s, slug=%s): %w", projectID, slug, err)
	}
	return id, nil
}

func (s *Service) loadEnvironmentFolders(ctx context.Context, envID uuid.UUID) ([]ListedFolder, error) {
	rows, err := s.db.Replica().Query(ctx, `
		SELECT id, name, version, "createdAt", "updatedAt", "envId", "parentId", "isReserved", description, "lastSecretModified"
		FROM secret_folders
		WHERE "envId" = @envID`, pgx.NamedArgs{"envID": envID})
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (ListedFolder, error) {
		var f ListedFolder
		err := row.Scan(&f.ID, &f.Name, &f.Version, &f.CreatedAt, &f.UpdatedAt, &f.EnvID, &f.ParentID, &f.IsReserved, &f.Description, &f.LastSecretModified)
		return f, err
	})
}
