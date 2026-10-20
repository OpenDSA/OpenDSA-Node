# Discovery Kubernetes deployment

Plain YAML manifests for deploying OpenDSA-Node to VT's Discovery cluster. See
`DiscoveryClusteryInstructions.pdf` (one level up from this repo) for the
course walkthrough this is based on.

## Placeholders

Namespace is already filled in everywhere: `91762f26-opendsanode` (CRN 91762,
Fall 2026, created via Cluster > Projects/Namespaces on the dashboard).

The only placeholder left is `__TAG__` in the Deployments/Job - whatever tag
you used on `docker push` (`latest`, or a commit SHA if you want something
more specific). Right now `40-backend-deployment.yaml`, `50-web-deployment.yaml`,
and `30-migrate-job.yaml` are all pinned to `:latest`, the first tag pushed.
Bump those three files whenever you push something new.

No GitLab CI/CD on this - the project has no runners, so images get built
and pushed by hand (that's also how the course PDF does it anyway). GitLab
project is `jaden/opendsa-node` on `git.cs.vt.edu`, registry images live at
`container.cs.vt.edu/jaden/opendsa-node/{backend,web,opendsa}`.

`20-mysql-pvc.yaml`'s StorageClass is already set to `ceph-rbd`, the only
one Discovery has.

## opendsa sidecar (book compile + serve)

`opendsa` runs as a second container inside the backend Pod in
`40-backend-deployment.yaml`, not as its own Deployment. Reasoning:

- Book generation writes a config file from the backend, then `opendsa`'s
  `/api/configure/` reads that same file by path and runs the compile
  script. They need to share a filesystem. Discovery only has one
  StorageClass and it's ReadWriteOnce, so two separate Deployments can't
  share a volume - sticking them in the same Pod with an `emptyDir` avoids
  that problem completely.
- The mount uses `subPath` so the backend's write path
  (`$OPENDSA_SHARED_DIR/config/temp/<file>.json`) and opendsa's own
  lookup path (`config/temp/<file>.json`, relative to its CWD) end up
  pointing at the same file, without wiping out the rest of opendsa's
  `config/` folder (it ships prebuilt templates it needs for compiling).
- Backend talks to opendsa over `localhost:8080` since they're in the same
  Pod - no need to go through the Service for that. The `opendsa` Service +
  the `/Books` Ingress path are just for serving compiled book pages to
  actual users.
- Replicas are set to 1 because of this pairing - 2 replicas would mean 2
  separate opendsa sidecars with their own compiled-book cache, so content
  compiled on one pod wouldn't show up on the other. Fine for now.

One extra wrinkle: the `opendsa` image needed its own Dockerfile. Its source
lives in `OpenDSA-DevStack`, and none of the Dockerfiles there (`Dockerfile`,
`Dockerfile.server`, `Dockerfile.deforms`) actually copy the app code into
the image - checked, and the real published `opendsa/opendsa:latest` on
Docker Hub is the same way. Turns out it always relied on a bind mount for
the actual source (docker-compose locally, `ssh + git pull` on staging).
Discovery has no host filesystem to mount from, so that doesn't work here.
`k8s/opendsa/Dockerfile.discovery` is just `Dockerfile.server` plus a
`COPY . .` at the end so it's actually self-contained - didn't touch
anything in DevStack itself (no push access there anyway). Build it from
`OpenDSA-DevStack/opendsa` as the context:

```
docker build --platform=linux/amd64 \
  -f <path-to-opendsa-node>/k8s/opendsa/Dockerfile.discovery \
  -t container.cs.vt.edu/jaden/opendsa-node/opendsa:__TAG__ .
docker push container.cs.vt.edu/jaden/opendsa-node/opendsa:__TAG__
```

## Namespace

Created through the dashboard, not YAML. Sanity check it exists before
applying anything:

```
kubectl get ns 91762f26-opendsanode
```

## Rollout sequence

1. Create the Project + Namespace on Discovery (dashboard).
2. Generate a GitLab Project Access Token on `git.cs.vt.edu` (role
   **Maintainer**, scope **read_registry**). Copy `10-secrets.example.yaml`
   -> `10-secrets.yaml` and fill in real values; build `11-registry-secret.yaml`
   following the comments in `11-registry-secret.example.yaml`. Apply both:
   ```
   kubectl apply -f k8s/10-secrets.yaml
   kubectl apply -f k8s/11-registry-secret.yaml
   ```
3. ```
   kubectl apply -f k8s/20-mysql-pvc.yaml
   kubectl get pvc mysql-data -n 91762f26-opendsanode   # expect Bound
   ```
4. ```
   kubectl apply -f k8s/21-mysql-deployment.yaml -f k8s/22-mysql-service.yaml
   kubectl get pods -n 91762f26-opendsanode -l app=mysql
   kubectl logs -n 91762f26-opendsanode deploy/mysql   # expect "ready for connections"
   ```
5. Build and push backend/web (from repo root - both Dockerfiles need the
   monorepo context) and opendsa (build command above):
   ```
   docker login container.cs.vt.edu
   docker build --platform=linux/amd64 -f apps/backend/Dockerfile \
     -t container.cs.vt.edu/jaden/opendsa-node/backend:__TAG__ .
   docker push container.cs.vt.edu/jaden/opendsa-node/backend:__TAG__
   docker build --platform=linux/amd64 -f apps/web/Dockerfile \
     -t container.cs.vt.edu/jaden/opendsa-node/web:__TAG__ .
   docker push container.cs.vt.edu/jaden/opendsa-node/web:__TAG__
   ```
   `--platform=linux/amd64` is needed building from an M-series Mac since
   Discovery is amd64. Re-run this whenever backend/web/opendsa code
   changes.
6. ```
   kubectl apply -f k8s/30-migrate-job.yaml
   kubectl wait --for=condition=complete job/backend-migrate -n 91762f26-opendsanode --timeout=120s
   kubectl logs -n 91762f26-opendsanode job/backend-migrate
   ```
   Don't move on if this fails. Jobs are immutable, so to retry:
   ```
   kubectl delete job backend-migrate -n 91762f26-opendsanode
   kubectl apply -f k8s/30-migrate-job.yaml
   ```
   Or just `kubectl exec` into a backend pod and run `npx prisma migrate deploy`
   directly if you need to debug it.
7. (Optional) seed data:
   ```
   kubectl run opendsa-seed --rm -it --restart=Never -n 91762f26-opendsanode \
     --image=container.cs.vt.edu/jaden/opendsa-node/backend:__TAG__ \
     --overrides='{"spec":{"imagePullSecrets":[{"name":"opendsa-registry"}]}}' \
     --env="DATABASE_URL=<same value as the Secret>" \
     --command -- npx tsx prisma/seed.ts
   ```
8. ```
   kubectl apply -f k8s/40-backend-deployment.yaml -f k8s/41-backend-service.yaml -f k8s/42-opendsa-service.yaml
   kubectl port-forward -n 91762f26-opendsanode svc/backend 3000:3000
   curl localhost:3000/api/health
   curl localhost:3000/api/health/db
   ```
   The backend Pod has 2 containers now (backend + opendsa), so
   `kubectl get pods -n 91762f26-opendsanode -l app=backend` should show
   `2/2` once both come up.
9. ```
   kubectl apply -f k8s/50-web-deployment.yaml -f k8s/51-web-service.yaml
   kubectl port-forward -n 91762f26-opendsanode svc/web 8080:80
   # browse localhost:8080, confirm the SPA loads
   ```
10. ```
    kubectl apply -f k8s/60-ingress.yaml
    kubectl get ingress -n 91762f26-opendsanode
    # browse https://91762f26-opendsanode.discovery.cs.vt.edu/ and /api/health
    # (needs on-campus network or VPN - see ingress note below)
    ```
11. Restart-safety checks:
    ```
    kubectl rollout restart deployment/backend -n 91762f26-opendsanode
    # replicas is 1 now (see opendsa sidecar notes above), so expect a
    # short gap in /api/health during the restart - not instant anymore

    kubectl rollout restart deployment/mysql -n 91762f26-opendsanode
    # confirm /api/health/db still works after, data still there
    ```

## Updating after a new image push

Either bump `:__TAG__` in the Deployment and `kubectl apply`, or do it the
manual way: scale to 0, wait for the pod to terminate, scale back to 1.
Don't leave something crash-looping on the shared cluster while debugging -
scale it to 0 first and check logs/exec instead.

## Notes / things to revisit

- StorageClass for the MySQL PVC - confirmed, it's `ceph-rbd`.
- Ingress stays VPN/on-campus only for now - no whitelist annotation. That
  annotation doesn't just let you in, it opens the whole thing to the
  public internet, which isn't worth it just to skip connecting to VPN.
  Use `kubectl port-forward` or the VPN if you need off-campus access.
- opendsa's resource requests/limits in `40-backend-deployment.yaml` are
  guesses - haven't actually run a real compile yet to know what it needs.
  Tune once we've tested it for real.
- Still need to double check that compiled book HTML uses relative links,
  so serving it under `/Books` (Ingress -> opendsa directly) instead of
  `/OpenDSA` through nginx like the old Rails setup actually works fine.
  Looked through `ODSA_Config.py` and `book_dir` is just a filesystem path,
  not a URL, so this should be fine, but want to see it work on an actual
  compiled book before fully trusting it.
