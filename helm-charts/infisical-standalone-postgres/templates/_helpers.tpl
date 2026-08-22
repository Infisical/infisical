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

{{- define "infisical.roleName" -}}
{{- printf "%s-infisical" .Release.Name -}}
{{- end -}}

{{- define "infisical.roleBindingName" -}}
{{- printf "%s-infisical" .Release.Name -}}
{{- end -}}

{{- define "infisical.serviceAccountName" -}}
{{- if .Values.infisical.serviceAccount.create -}}
{{- printf "%s-infisical" .Release.Name -}}
{{- else -}}
{{- .Values.infisical.serviceAccount.name | default "default" -}}
{{- end -}}
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

{{- define "infisical.postgresService" -}}
{{- if .Values.postgresql.fullnameOverride -}}
{{- .Values.postgresql.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-postgresql" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "infisical.postgresDBConnectionString" -}}
{{- $dbUsername := .Values.postgresql.auth.username -}}
{{- $dbPassword := .Values.postgresql.auth.password -}}
{{- $dbName := .Values.postgresql.auth.database -}}
{{- $serviceName := include "infisical.postgresService" . -}}
{{- printf "postgresql://%s:%s@%s:5432/%s" $dbUsername $dbPassword $serviceName $dbName -}}
{{- end -}}

{{/*
Create a fully qualified redis name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "infisical.redis.fullname" -}}
{{- if .Values.redis.fullnameOverride -}}
{{- .Values.redis.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- printf "%s-%s" .Release.Name .Values.redis.name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s-%s" .Release.Name $name .Values.redis.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}


{{- define "infisical.redisServiceName" -}}
{{- if .Values.redis.fullnameOverride -}}
{{- printf "%s-master" .Values.redis.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-master" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}


{{- define "infisical.redisConnectionString" -}}
{{- $password := .Values.redis.auth.password -}}
{{- $serviceName := include "infisical.redisServiceName" . -}}
{{- printf "redis://default:%s@%s:6379" $password $serviceName -}}
{{- end -}}