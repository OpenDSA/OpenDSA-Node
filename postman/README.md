# Postman: OpenDSA book generation and compilation

Import these into Postman:

- `OpenDSA-Book-Testing.postman_collection.json`
- `OpenDSA-Local.postman_environment.json`
- `OpenDSA-Remote.postman_environment.json`

Select one environment, set `password` to the seeded instructor's password, then run the
folders in order.

## Local Docker

```bash
docker compose up -d mysql opendsa backend
```

- Backend: `http://localhost:3000` (development auth over HTTP is allowed)
- Compiled books: `http://localhost:8080/Books/...`
- Seed the database first and set `SEED_AUTH_PASSWORD` if the instructor has no password.
- `compile-only` does not need Canvas.
- `Generate Canvas Course` needs a real Canvas API token in `LmsAccess`; the dev seed's
  `seed-canvas-api-key` is rejected.

The shared compile config goes through `./.opendsa-shared/config/temp`.

## Remote Discovery

- Base URL is `https://91762f26-opendsanode.discovery.cs.vt.edu`.
- The backend image must be built from the current `dev` commit and referenced in
  `k8s/40-backend-deployment.yaml`; the checked-in tag may be older.
- Apply the `opendsa-books` PVC and confirm the opendsa container can write
  `/opendsa/Books`.
- Production auth requires HTTPS, so use the ingress URL (not a direct pod port-forward).
- The same instructor password/`PASSWORD_PEPPER` must match the seeded account.

## Folder order

1. **Auth** — CSRF token, login, current user.
2. **Discovery** — sets organization/course/term/LMS IDs from the seeded data. If your
   test data isn't first in those lists, set the environment variables manually.
3. **Import Simple Config** — runs `simple2full` via the opendsa container and creates a
   template book. Saves `templateBookId`.
4. **Create Offering** — clones the template into an LMS offering and a textbook
   offering. Saves `clonedBookId` and `textbookClonedBookId`.
5. **Compile Only** — calls `POST /api/inst_books/:id/compile` for either cloned book.
   No Canvas calls. Saves `compileBuildPath` and `compileBookUrl`.
6. **Verify Compiled Book** — checks the index, `_static` CSS, and `/lib` asset.
7. **Generate Canvas Course (optional)** — calls the content-only Canvas generation
   route, which also compiles. Requires a real Canvas token and test course.

## Notes

- Compile-only requires the book to already be attached to a course offering; the
  template book alone has no `buildPath`.
- LMS offerings that have not been Canvas-synced produce valid `html/` pages, but
  `lti_html` internal links are placeholders. The 1.1/1.3 launch path uses `html/`.
- Textbook offerings set the compiler's `--standalone-modules` flag automatically.
- `lti_html` embeds absolute `/OpenDSA/...` links; the scoped Discovery ingress serves
  `/Books`, `/lib`, `/AV`, etc., so use `html/` for verification.
