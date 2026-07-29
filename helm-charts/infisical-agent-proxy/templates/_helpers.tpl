{{/*
Expand the name of the chart.
*/}}
{{- define "infisical-agent-proxy.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "infisical-agent-proxy.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "infisical-agent-proxy.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "infisical-agent-proxy.labels" -}}
helm.sh/chart: {{ include "infisical-agent-proxy.chart" . }}
{{ include "infisical-agent-proxy.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "infisical-agent-proxy.selectorLabels" -}}
app.kubernetes.io/name: {{ include "infisical-agent-proxy.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "infisical-agent-proxy.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "infisical-agent-proxy.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Name of the Secret holding the machine identity credentials. Either the user's own Secret
or the one this chart renders from the inline values.
*/}}
{{- define "infisical-agent-proxy.authSecretName" -}}
{{- if .Values.auth.existingSecretRef }}
{{- .Values.auth.existingSecretRef }}
{{- else }}
{{- printf "%s-auth" (include "infisical-agent-proxy.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Key within the auth Secret that holds the client id. The chart-rendered Secret always uses
the documented default; an existing Secret may use whatever key the user configured.
*/}}
{{- define "infisical-agent-proxy.clientIdKey" -}}
{{- if .Values.auth.existingSecretRef }}
{{- .Values.auth.clientIdKey | default "clientId" }}
{{- else }}
{{- "clientId" }}
{{- end }}
{{- end }}

{{/*
Key within the auth Secret that holds the client secret.
*/}}
{{- define "infisical-agent-proxy.clientSecretKey" -}}
{{- if .Values.auth.existingSecretRef }}
{{- .Values.auth.clientSecretKey | default "clientSecret" }}
{{- else }}
{{- "clientSecret" }}
{{- end }}
{{- end }}
