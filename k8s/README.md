# Discovery Kubernetes deployment

Plain YAML manifests for deploying OpenDSA-Node to VT's Discovery cluster. See
`DiscoveryClusteryInstructions.pdf` (repo root's parent directory) for the
full course walkthrough this is based on.

## Before applying anything - fill in these placeholders

Every manifest uses `__NAMESPACE__`; the Deployments/Job also use `__TAG__`.
Find-and-replace them (or templatize with `envsubst`/`kustomize` later if
that becomes worth it - out of scope for now):

- `__NAMESPACE__`: the Namespace you create via the Discovery dashboard
  (Cluster > Projects/Namespaces), following the course convention
  `<section><semester><year>-<projectname>`, e.g. `83585f25-opendsanode`.
- `__TAG__`: an image tag pushed by GitLab CI (`$CI_COMMIT_SHORT_SHA` or
  `latest`).

The VT GitLab project is `jaden/opendsa-node` (project ID 36387 on
`git.cs.vt.edu`), so `$CI_REGISTRY_IMAGE` in CI resolves to
`container.cs.vt.edu/jaden/opendsa-node`, and the Deployments/Job already
hardcode the resulting image paths -
`container.cs.vt.edu/jaden/opendsa-node/{backend,web}:__TAG__` - no
`__GITLAB_PATH__` placeholder left to fill in.

`20-mysql-pvc.yaml` already uses the confirmed StorageClass, `ceph-rbd`
(the only one on Discovery, provisioner `rbd.csi.ceph.com`, not marked
default) - no placeholder left there either.

## Namespace

Created through the dashboard, not YAML - matches the course's demonstrated
workflow. Confirm it exists before applying anything here:

```
kubectl get ns __NAMESPACE__
```

## Rollout sequence

1. Create the Project + Namespace on Discovery (dashboard).
2. Generate a GitLab Project Access Token on the `git.cs.vt.edu` project
   (role **Maintainer**, scope **read_registry**). Copy `10-secrets.example.yaml`
   -> `10-secrets.yaml` and fill in real values; generate `11-registry-secret.yaml`
   per the instructions in `11-registry-secret.example.yaml`. Apply both:
   ```
   kubectl apply -f k8s/10-secrets.yaml
   kubectl apply -f k8s/11-registry-secret.yaml
   ```
3. ```
   kubectl apply -f k8s/20-mysql-pvc.yaml
   kubectl get pvc mysql-data -n __NAMESPACE__   # expect Bound
   ```
4. ```
   kubectl apply -f k8s/21-mysql-deployment.yaml -f k8s/22-mysql-service.yaml
   kubectl get pods -n __NAMESPACE__ -l app=mysql
   kubectl logs -n __NAMESPACE__ deploy/mysql   # expect "ready for connections"
   ```
5. Push to `main` (triggers `.gitlab-ci.yml`) or manually
   `docker login container.cs.vt.edu` + build + push, to get the first
   backend/web images into the registry.
6. ```
   kubectl apply -f k8s/30-migrate-job.yaml
   kubectl wait --for=condition=complete job/backend-migrate -n __NAMESPACE__ --timeout=120s
   kubectl logs -n __NAMESPACE__ job/backend-migrate
   ```
   Don't proceed if this fails. Job specs are immutable - to retry:
   ```
   kubectl delete job backend-migrate -n __NAMESPACE__
   kubectl apply -f k8s/30-migrate-job.yaml
   ```
   Fallback for ad-hoc debugging: `kubectl exec` into a running backend pod
   and run `npx prisma migrate deploy` directly.
7. (Optional) seed data:
   ```
   kubectl run opendsa-seed --rm -it --restart=Never -n __NAMESPACE__ \
     --image=container.cs.vt.edu/jaden/opendsa-node/backend:__TAG__ \
     --overrides='{"spec":{"imagePullSecrets":[{"name":"opendsa-registry"}]}}' \
     --env="DATABASE_URL=<same value as the Secret>" \
     --command -- npx tsx prisma/seed.ts
   ```
8. ```
   kubectl apply -f k8s/40-backend-deployment.yaml -f k8s/41-backend-service.yaml
   kubectl port-forward -n __NAMESPACE__ svc/backend 3000:3000
   curl localhost:3000/api/health
   curl localhost:3000/api/health/db
   ```
9. ```
   kubectl apply -f k8s/50-web-deployment.yaml -f k8s/51-web-service.yaml
   kubectl port-forward -n __NAMESPACE__ svc/web 8080:80
   # browse localhost:8080, confirm the SPA loads
   ```
10. ```
    kubectl apply -f k8s/60-ingress.yaml
    kubectl get ingress -n __NAMESPACE__
    # browse https://__NAMESPACE__.discovery.cs.vt.edu/ and /api/health
    # (on-campus network or VPN unless you enabled the whitelist annotation)
    ```
11. Restart-safety checks:
    ```
    kubectl rollout restart deployment/backend -n __NAMESPACE__
    # /api/health should stay reachable throughout (replicas: 2)

    kubectl rollout restart deployment/mysql -n __NAMESPACE__
    # confirm /api/health/db still succeeds afterward, data intact
    ```

## Updating after a new image push

Either let the rolling update handle it (bump the `:__TAG__` in the
Deployment and `kubectl apply`), or follow the instructor's manual pattern:
scale the Deployment to 0, wait for pods to terminate, scale back up. Don't
leave a crash-looping Deployment running on the shared cluster while
debugging - scale to 0 and investigate via logs/exec instead.

## Open questions to confirm before relying on this in prod

- [x] StorageClass name for the MySQL PVC - confirmed `ceph-rbd`.
- [x] Ingress whitelist annotation - staying off (VPN/on-campus only) for
      now. It's not a personal allowlist; enabling it opens the ingress to
      all internet traffic, not just the dev team, which isn't worth it on
      a shared cluster just to skip connecting to VPN. For off-campus
      testing, use VPN or `kubectl port-forward` (see steps 8-9 above)
      instead. Revisit only if there's a real off-campus access requirement
      later.
