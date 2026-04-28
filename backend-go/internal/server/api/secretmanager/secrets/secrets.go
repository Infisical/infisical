package secrets

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/secretmanager/environment"
	"github.com/infisical/api/internal/services/secretmanager/secret"
	"github.com/infisical/api/internal/services/secretmanager/secretfolder"
	"github.com/infisical/api/internal/services/secretmanager/secretimport"
	secretsexpansion "github.com/infisical/api/internal/services/secretmanager/secrets"
)

type permissionSvc interface {
	GetProjectPermission(ctx context.Context, args *permission.GetProjectPermissionArgs) (*permission.GetProjectPermissionResult, error)
}

type kmsSvc interface {
	CreateCipherPairWithDataKey(ctx context.Context, dto kms.CreateCipherPairDTO) (*kms.CipherPair, error)
}

type secretFolderSvc interface {
	LoadProjectFolders(ctx context.Context, projectID string, envIDs []uuid.UUID) (*secretfolder.FolderLookup, error)
}

type secretImportSvc interface {
	LoadProjectImports(ctx context.Context, projectID string) (*secretimport.ImportLookup, error)
}

type secretDAL interface {
	FindByFolderIds(ctx context.Context, folderIDs []uuid.UUID, userID *uuid.UUID, filters *secret.FindByFolderIdsFilter) ([]secret.Secret, error)
}

type environmentDAL interface {
	GetBySlug(ctx context.Context, projectID string, slug string) (*environment.Environment, error)
	GetAllByProjectID(ctx context.Context, projectID string) ([]environment.Environment, error)
}

type service struct {
	auth.AuthHandler
	logger          *slog.Logger
	permissionSvc   permissionSvc
	kmsSvc          kmsSvc
	secretFolderSvc secretFolderSvc
	secretImportSvc secretImportSvc
	secretDAL       secretDAL
	environmentDAL  environmentDAL
}

// Deps holds the dependencies for the secrets service.
type Deps struct {
	AuthHandler    auth.AuthHandler
	Permission     permissionSvc
	KMS            kmsSvc
	SecretFolder   secretFolderSvc
	SecretImport   secretImportSvc
	SecretDAL      secretDAL
	EnvironmentDAL environmentDAL
}

func NewService(logger *slog.Logger, deps *Deps) gensecrets.Service {
	return &service{
		AuthHandler:     deps.AuthHandler,
		logger:          logger.With(slog.String("service", "secrets")),
		permissionSvc:   deps.Permission,
		kmsSvc:          deps.KMS,
		secretFolderSvc: deps.SecretFolder,
		secretImportSvc: deps.SecretImport,
		secretDAL:       deps.SecretDAL,
		environmentDAL:  deps.EnvironmentDAL,
	}
}

func (s *service) ListSecretsV4(ctx context.Context, p *gensecrets.ListSecretsV4Payload) (*gensecrets.ListSecretsResult, error) {
	s.logger.InfoContext(ctx, "listing secrets v4",
		slog.String("projectId", p.ProjectID),
		slog.String("environment", p.Environment),
		slog.String("secretPath", p.SecretPath),
	)

	// 1. Get identity from context
	identity := auth.IdentityFromContext(ctx)
	if identity == nil {
		return nil, errutil.Unauthorized("Authentication required")
	}

	actorID := identity.ActorID
	orgID := identity.OrgID

	// TODO(go): Permission fingerprint for ETag caching

	// 2. Get project permission
	permResult, err := s.permissionSvc.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             identity.Actor,
		ActorID:           actorID,
		ProjectID:         p.ProjectID,
		ActorAuthMethod:   identity.AuthMethod,
		ActorOrgID:        orgID,
		ActionProjectType: permission.ActionProjectTypeSecretManager,
	})
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to get project permission").WithErr(err)
	}

	// 3. Load all environments for the project (metadata only, for envID -> slug mapping)
	allEnvs, err := s.environmentDAL.GetAllByProjectID(ctx, p.ProjectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load environments").WithErr(err)
	}

	// Build environment lookups and find requested env
	envByID := make(map[uuid.UUID]secretimport.EnvironmentInfo, len(allEnvs))
	envBySlug := make(map[string]uuid.UUID, len(allEnvs))
	var env *environment.Environment
	for i := range allEnvs {
		envByID[allEnvs[i].ID] = secretimport.EnvironmentInfo{
			ID:   allEnvs[i].ID,
			Slug: allEnvs[i].Slug,
		}
		envBySlug[allEnvs[i].Slug] = allEnvs[i].ID
		if allEnvs[i].Slug == p.Environment {
			env = &allEnvs[i]
		}
	}
	if env == nil {
		return nil, errutil.NotFound("Environment not found").WithErr(
			fmt.Errorf("environment '%s' not found in project", p.Environment),
		)
	}

	// 4. Load imports for the project
	importLookup, err := s.secretImportSvc.LoadProjectImports(ctx, p.ProjectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load imports").WithErr(err)
	}

	// 5. Resolve direct folders + import chain
	chainResolver := secretimport.NewChainResolver(importLookup, s.secretFolderSvc)
	chainResult, err := chainResolver.Resolve(ctx, p.ProjectID, env.ID, p.SecretPath, p.Recursive, envByID)
	if err != nil {
		return nil, errutil.NotFound("Folder not found").WithErr(err)
	}

	// 6. Prepare user ID for personal secrets
	var userID *uuid.UUID
	if identity.Actor == permission.ActorTypeUser {
		userID = &actorID
	}

	// 7. Fetch secrets from all folders (direct + imported)
	allFolderIDs := chainResult.AllFolderIDs()
	secrets, err := s.secretDAL.FindByFolderIds(ctx, allFolderIDs, userID, nil)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to fetch secrets").WithErr(err)
	}

	// 8. Get KMS cipher pair for decryption
	cipherPair, err := s.kmsSvc.CreateCipherPairWithDataKey(ctx, kms.CreateCipherPairDTO{
		Type:      kms.DataKeyProject,
		ProjectID: p.ProjectID,
	})
	if err != nil {
		return nil, errutil.InternalServer("Failed to get decryption key").WithErr(err)
	}

	// 9. Process secrets with permission filtering
	directSecrets, importedSecrets := processSecretsWithPermissions(
		secrets,
		chainResult.DirectFolderIDs,
		chainResult.DirectPaths,
		chainResult.Imports,
		p.Environment,
		secretProcessorOpts{
			ViewSecretValue: p.ViewSecretValue,
			Ability:         permResult.Permission.Ability,
			CipherPair:      cipherPair,
		},
	)

	// 10. Expand secret references if requested
	if p.ExpandSecretReferences {
		inputs := buildSecretInputsForExpansion(directSecrets, importedSecrets, chainResult.Imports)

		absoluteFetcher := newAbsoluteSecretFetcher(
			ctx,
			p.ProjectID,
			envBySlug,
			chainResult.FolderLookup,
			s.secretFolderSvc,
			s.secretDAL,
			cipherPair,
			userID,
		)

		expander := secretsexpansion.NewSecretExpander(inputs, secretsexpansion.ExpandOpts{
			CanAccessAbsolute: func(ref secretsexpansion.AbsoluteSecretRef) bool {
				return permission.CanReadSecretValue(permResult.Permission.Ability, ref.Env, ref.Path, ref.Key, nil)
			},
			FetchAbsoluteSecrets: absoluteFetcher.Fetch,
		})
		expander.Expand()
		applyExpandedValues(directSecrets, importedSecrets, expander)
	}

	// 11. Build response
	result := make([]*gensecrets.SecretRaw, 0, len(directSecrets))
	for i := range directSecrets {
		result = append(result, s.buildSecretRaw(&directSecrets[i], p.ProjectID, cipherPair))
	}

	var importsResult []*gensecrets.SecretImport
	if p.IncludeImports {
		importsResult = s.buildImportsResponse(importedSecrets, chainResult.Imports, p.ProjectID, cipherPair)
	}

	// TODO(go): ETag caching

	return &gensecrets.ListSecretsResult{
		Secrets: result,
		Imports: importsResult,
	}, nil
}

// buildSecretRaw converts a processedSecret to the API response type.
func (s *service) buildSecretRaw(ps *processedSecret, projectID string, cipherPair *kms.CipherPair) *gensecrets.SecretRaw {
	sec := ps.Secret

	tags := make([]*gensecrets.SecretTag, 0, len(sec.Tags))
	for _, tag := range sec.Tags {
		tags = append(tags, &gensecrets.SecretTag{
			ID:   tag.ID.String(),
			Slug: tag.Slug,
		})
	}

	metadata := make([]*gensecrets.ResourceMetadata, 0, len(sec.SecretMetadata))
	for _, m := range sec.SecretMetadata {
		value := m.Value
		isEncrypted := len(m.EncryptedValue) > 0
		if isEncrypted {
			if decrypted, err := cipherPair.Decrypt(m.EncryptedValue); err == nil {
				value = string(decrypted)
			}
		}
		metadata = append(metadata, &gensecrets.ResourceMetadata{
			Key:         m.Key,
			Value:       value,
			IsEncrypted: isEncrypted,
		})
	}

	isRotated := sec.IsRotatedSecret()
	var rotationID *string
	if isRotated {
		rid := sec.GetRotationID().String()
		rotationID = &rid
	}

	var skipMultilineEncoding *bool
	if sec.SkipMultilineEncoding.Valid {
		skipMultilineEncoding = &sec.SkipMultilineEncoding.V
	}

	secretPath := ps.SecretPath
	return &gensecrets.SecretRaw{
		ID:                    sec.ID.String(),
		LegacyID:              sec.ID.String(),
		Workspace:             projectID,
		Environment:           ps.Environment,
		Version:               int(sec.Version),
		Type:                  sec.Type,
		SecretKey:             sec.Key,
		SecretValue:           ps.Value,
		SecretComment:         ps.Comment,
		SecretPath:            &secretPath,
		CreatedAt:             sec.CreatedAt.Format("2006-01-02T15:04:05.000Z"),
		UpdatedAt:             sec.UpdatedAt.Format("2006-01-02T15:04:05.000Z"),
		SecretValueHidden:     ps.ValueHidden,
		SkipMultilineEncoding: skipMultilineEncoding,
		Tags:                  tags,
		SecretMetadata:        metadata,
		IsRotatedSecret:       &isRotated,
		RotationID:            rotationID,
	}
}

// buildImportsResponse builds the imports array for the API response.
func (s *service) buildImportsResponse(
	importedSecrets []processedSecret,
	imports []secretimport.ResolvedImport,
	projectID string,
	cipherPair *kms.CipherPair,
) []*gensecrets.SecretImport {
	secretsByImport := make(map[string][]processedSecret)
	for i := range importedSecrets {
		sec := &importedSecrets[i]
		key := sec.ImportEnvironment + ":" + sec.ImportPath
		secretsByImport[key] = append(secretsByImport[key], *sec)
	}

	result := make([]*gensecrets.SecretImport, 0, len(imports))
	for i := range imports {
		imp := &imports[i]
		key := imp.EnvSlug + ":" + imp.Path
		secrets := secretsByImport[key]

		importSecrets := make([]*gensecrets.ImportSecretRaw, 0, len(secrets))
		for j := range secrets {
			importSecrets = append(importSecrets, s.buildImportSecretRaw(&secrets[j], projectID, cipherPair))
		}

		folderID := imp.FolderID.String()
		result = append(result, &gensecrets.SecretImport{
			SecretPath:  imp.Path,
			Environment: imp.EnvSlug,
			FolderID:    &folderID,
			Secrets:     importSecrets,
		})
	}

	return result
}

// buildImportSecretRaw converts a processedSecret to the import API response type.
func (s *service) buildImportSecretRaw(ps *processedSecret, projectID string, cipherPair *kms.CipherPair) *gensecrets.ImportSecretRaw {
	sec := ps.Secret

	metadata := make([]*gensecrets.ResourceMetadata, 0, len(sec.SecretMetadata))
	for _, m := range sec.SecretMetadata {
		value := m.Value
		isEncrypted := len(m.EncryptedValue) > 0
		if isEncrypted {
			if decrypted, err := cipherPair.Decrypt(m.EncryptedValue); err == nil {
				value = string(decrypted)
			}
		}
		metadata = append(metadata, &gensecrets.ResourceMetadata{
			Key:         m.Key,
			Value:       value,
			IsEncrypted: isEncrypted,
		})
	}

	isRotated := sec.IsRotatedSecret()
	var rotationID *string
	if isRotated {
		rid := sec.GetRotationID().String()
		rotationID = &rid
	}

	var skipMultilineEncoding *bool
	if sec.SkipMultilineEncoding.Valid {
		skipMultilineEncoding = &sec.SkipMultilineEncoding.V
	}

	return &gensecrets.ImportSecretRaw{
		ID:                    sec.ID.String(),
		LegacyID:              sec.ID.String(),
		Workspace:             projectID,
		Environment:           ps.Environment,
		Version:               int(sec.Version),
		Type:                  sec.Type,
		SecretKey:             sec.Key,
		SecretValue:           ps.Value,
		SecretComment:         ps.Comment,
		SecretValueHidden:     ps.ValueHidden,
		SkipMultilineEncoding: skipMultilineEncoding,
		SecretMetadata:        metadata,
		IsRotatedSecret:       &isRotated,
		RotationID:            rotationID,
	}
}

func (s *service) GetSecretByNameV4(ctx context.Context, p *gensecrets.GetSecretByNameV4Payload) (*gensecrets.GetSecretResult, error) {
	s.logger.InfoContext(ctx, "getting secret by name v4",
		slog.String("secretName", p.SecretName),
		slog.String("projectId", p.ProjectID),
		slog.String("environment", p.Environment),
	)
	return &gensecrets.GetSecretResult{
		Secret: &gensecrets.SecretRaw{
			ID:                "stub",
			LegacyID:          "stub",
			Workspace:         p.ProjectID,
			Environment:       p.Environment,
			Version:           1,
			Type:              "shared",
			SecretKey:         p.SecretName,
			SecretValue:       "",
			SecretComment:     "",
			CreatedAt:         "",
			UpdatedAt:         "",
			SecretValueHidden: false,
		},
	}, nil
}

func (s *service) ListSecretsRawV3(ctx context.Context, p *gensecrets.ListSecretsRawV3Payload) (*gensecrets.ListSecretsResult, error) {
	s.logger.InfoContext(ctx, "listing secrets raw v3")
	return &gensecrets.ListSecretsResult{
		Secrets: []*gensecrets.SecretRaw{},
	}, nil
}

func (s *service) GetSecretByNameRawV3(ctx context.Context, p *gensecrets.GetSecretByNameRawV3Payload) (*gensecrets.GetSecretResult, error) {
	s.logger.InfoContext(ctx, "getting secret by name raw v3",
		slog.String("secretName", p.SecretName),
	)
	return &gensecrets.GetSecretResult{
		Secret: &gensecrets.SecretRaw{
			ID:                "stub",
			LegacyID:          "stub",
			Workspace:         "",
			Environment:       "",
			Version:           1,
			Type:              "shared",
			SecretKey:         p.SecretName,
			SecretValue:       "",
			SecretComment:     "",
			CreatedAt:         "",
			UpdatedAt:         "",
			SecretValueHidden: false,
		},
	}, nil
}
