{{/*
Expand the name of the chart.
*/}}
{{- define "infisical-gateway.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "infisical-gateway.fullname" -}}
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
{{- define "infisical-gateway.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "infisical-gateway.labels" -}}
helm.sh/chart: {{ include "infisical-gateway.chart" . }}
{{ include "infisical-gateway.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "infisical-gateway.selectorLabels" -}}
app.kubernetes.io/name: {{ include "infisical-gateway.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "infisical-gateway.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "infisical-gateway.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Port the gateway listens on for direct connections, taken from gateway.listenAddress so the
container port and the Service can never disagree with what the gateway actually binds.
*/}}
{{- define "infisical-gateway.listenPort" -}}
{{- $addr := .Values.gateway.listenAddress -}}
{{- $port := splitList ":" $addr | last -}}
{{- if or (eq $port $addr) (not (regexMatch "^[0-9]+$" $port)) -}}
{{- fail (printf "gateway.listenAddress must be host:port, got %q" $addr) -}}
{{- end -}}
{{- $port -}}
{{- end }}

{{/*
Port the Service exposes. Defaults to the port in gateway.listenAddress, because that address is
what the platform dials: a Service listening on anything else is unreachable at the registered
address. Set service.port only to put a different port in front of the gateway.
*/}}
{{- define "infisical-gateway.servicePort" -}}
{{- if .Values.service.port -}}
{{- .Values.service.port -}}
{{- else -}}
{{- include "infisical-gateway.listenPort" . -}}
{{- end -}}
{{- end }}
