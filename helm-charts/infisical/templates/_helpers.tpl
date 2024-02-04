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


{{- define "infisical.backend.labels" -}}
{{ include "infisical.backend.matchLabels" . }}
{{ include "infisical.common.metaLabels" . }}
{{- end -}}

{{- define "infisical.backend.matchLabels" -}}
component: {{ .Values.backend.name | quote }}
{{ include "infisical.common.matchLabels" . }}
{{- end -}}

{{- define "infisical.mongodb.labels" -}}
{{ include "infisical.mongodb.matchLabels" . }}
{{ include "infisical.common.metaLabels" . }}
{{- end -}}

{{- define "infisical.mongodb.matchLabels" -}}
component: {{ .Values.mongodb.name | quote }}
{{ include "infisical.common.matchLabels" . }}
{{- end -}}

{{/*
Create a fully qualified backend name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "infisical.backend.fullname" -}}
{{- if .Values.backend.fullnameOverride -}}
{{- .Values.backend.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- printf "%s-%s" .Release.Name .Values.backend.name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s-%s" .Release.Name $name .Values.backend.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}


{{/*
Create a fully qualified mongodb name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "infisical.mongodb.fullname" -}}
{{- if .Values.mongodb.fullnameOverride -}}
{{- .Values.mongodb.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- printf "%s-%s" .Release.Name .Values.mongodb.name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s-%s" .Release.Name $name .Values.mongodb.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create the mongodb connection string.
*/}}
{{- define "infisical.mongodb.connectionString" -}}
{{- $host := include "infisical.mongodb.fullname" . -}}
{{- $port := 27017 -}}
{{- $user := first .Values.mongodb.auth.usernames | default "root" -}}
{{- $pass := first .Values.mongodb.auth.passwords | default "root" -}}
{{- $database := first .Values.mongodb.auth.databases | default "test" -}}
{{- $connectionString := printf "mongodb://%s:%s@%s:%d/%s" $user $pass $host $port $database -}}
{{/* Backward compatibility (< 0.1.16, deprecated) */}}
{{- if .Values.mongodbConnection.externalMongoDBConnectionString -}}
{{- $connectionString = .Values.mongodbConnection.externalMongoDBConnectionString -}}
{{- end -}}
{{- printf "%s" $connectionString -}}
{{- end -}}