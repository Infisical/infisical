{{/* Chart name */}}
{{- define "infisical.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Fully qualified app name */}}
{{- define "infisical.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s" (include "infisical.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/* Common labels */}}
{{- define "infisical.labels" -}}
app.kubernetes.io/name: {{ include "infisical.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{/* Selector labels */}}
{{- define "infisical.selectorLabels" -}}
app.kubernetes.io/name: {{ include "infisical.name" . }}
app.kubernetes.io/component: backend
{{- end -}}

{{/*
Resolve the encryption key: use the provided value, else reuse the one already
stored in the Secret (so upgrades don't rotate it), else generate a new one.
*/}}
{{- define "infisical.encryptionKey" -}}
{{- if .Values.secrets.encryptionKey -}}
{{- .Values.secrets.encryptionKey -}}
{{- else -}}
{{- $existing := lookup "v1" "Secret" .Release.Namespace (printf "%s-secrets" (include "infisical.fullname" .)) -}}
{{- if and $existing $existing.data.ENCRYPTION_KEY -}}
{{- $existing.data.ENCRYPTION_KEY | b64dec -}}
{{- else -}}
{{- randAlphaNum 32 -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
DB_CONNECTION_URI env entry. With CNPG enabled, pull the ready-made connection
string from the CNPG-generated "<release>-db-app" secret's "uri" key. Otherwise
use the external URI stored in the chart's own secret.
*/}}
{{- define "infisical.dbEnv" -}}
- name: DB_CONNECTION_URI
  valueFrom:
    secretKeyRef:
{{- if .Values.postgres.cnpg.enabled }}
      name: {{ include "infisical.fullname" . }}-db-app
      key: uri
{{- else }}
      name: {{ include "infisical.fullname" . }}-secrets
      key: DB_CONNECTION_URI
{{- end }}
{{- end -}}

{{/* REDIS_URL: in-cluster Redis service when enabled, else the external URL. */}}
{{- define "infisical.redisUrl" -}}
{{- if .Values.redis.enabled -}}
redis://{{ include "infisical.fullname" . }}-redis:{{ .Values.redis.port }}
{{- else -}}
{{ .Values.secrets.redisUrl }}
{{- end -}}
{{- end -}}

{{- define "infisical.authSecret" -}}
{{- if .Values.secrets.authSecret -}}
{{- .Values.secrets.authSecret -}}
{{- else -}}
{{- $existing := lookup "v1" "Secret" .Release.Namespace (printf "%s-secrets" (include "infisical.fullname" .)) -}}
{{- if and $existing $existing.data.AUTH_SECRET -}}
{{- $existing.data.AUTH_SECRET | b64dec -}}
{{- else -}}
{{- randAlphaNum 44 -}}
{{- end -}}
{{- end -}}
{{- end -}}
