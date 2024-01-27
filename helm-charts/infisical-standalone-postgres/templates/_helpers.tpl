{{/*
Expand the name of the chart.
*/}}
{{- define "infisical.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "infisical.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create unified labels for infisical components
*/}}
{{- define "infisical.common.matchLabels" -}}
app: {{ template "infisical.name" . }}
release: {{ .Release.Name }}
{{- end -}}

{{- define "infisical.common.metaLabels" -}}
chart: {{ template "infisical.chart" . }}
heritage: {{ .Release.Service }}
{{- end -}}

{{- define "infisical.common.labels" -}}
{{ include "infisical.common.matchLabels" . }}
{{ include "infisical.common.metaLabels" . }}
{{- end -}}


{{- define "infisical.labels" -}}
{{ include "infisical.matchLabels" . }}
{{ include "infisical.common.metaLabels" . }}
{{- end -}}

{{- define "infisical.matchLabels" -}}
component: {{ .Values.infisical.name | quote }}
{{ include "infisical.common.matchLabels" . }}
{{- end -}}

{{/*
Create a fully qualified backend name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "infisical.fullname" -}}
{{- if .Values.infisical.fullnameOverride -}}
{{- .Values.infisical.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- printf "%s-%s" .Release.Name .Values.infisical.name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s-%s" .Release.Name $name .Values.infisical.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}
