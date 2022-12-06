### helm repository Setup
Assuming you have helm already installed, it is straight-forward to add a Cloudsmith-based chart repository:

```
helm repo add infisical-helm-charts 'https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/' 
  
helm repo update
```

### Installing a Helm Chart
```
helm install infisical-helm-charts/<name-of-helm-chart>
```

#### Available chart names
- infisical
