# OpenDSA-Node

OpenDSA-Node is a dockerized Node.js server for the OpenDSA eTextbook system. It uses LTI 1.3 (with support for LTI 1.1) to serve OpenDSA content to Learning Management Systems such as Canvas or Moodle. This repository uses the OpenDSA frontend content repository ([OpenDSA](https://github.com/OpenDSA/OpenDSA)).

OpenDSA-Node is intended to be a direct replacement for the two repositories that implement the Ruby/Rails version of the OpenDSA server: OpenDSA-LTI and OpenDSA-DevStack.

## Instructions

Clone repository, ensure docker is installed, run docker compose up --build

### Running with the opendsa compiler locally

`docker compose up --build` also starts `opendsa`, the OpenDSA book
compiler/serving container, wired up the same way as the Discovery
deployment:

- `opendsa` source comes from the sibling `OpenDSA-DevStack` checkout
  (`../OpenDSA-DevStack/opendsa`). Override with `OPENDSA_SRC=/path/to/OpenDSA`
  if yours lives elsewhere.
- The compile config handoff uses `./.opendsa-shared/` on the host, which
  stands in for the k8s `emptyDir`: the backend writes
  `config/temp/<file>.json` to `/mnt/opendsa-shared`, and that same directory
  is mounted at `/opendsa/config/temp` for the compiler. The directory is
  gitignored and safe to delete.
- `opendsa` is published on `:8080`, which stands in for the `/Books` Ingress
  path. Compiled books are written to
  `../OpenDSA-DevStack/opendsa/Books/<org>/<course>/<term>/<label>/` on the
  host and served at `http://localhost:8080/Books/...` (or through the Vite
  dev server at `http://localhost:5173/Books/...`, which proxies there).
- Unlike k8s, `CONFIG_API_LINK` points at `http://opendsa:8080/...` instead of
  `localhost`, because the compiler is a separate container here rather than a
  sidecar in the backend Pod.

To exercise the handoff without the course-generation route (which also needs
Canvas credentials and seeded data), drop a minimal config into the shared dir
and hit the compiler directly:

```bash
mkdir -p .opendsa-shared/config/temp
cat > .opendsa-shared/config/temp/smoke.json <<'JSON'
{
  "title": "Local Smoke Test",
  "desc": "Backend to opendsa handoff check",
  "build_dir": "Books",
  "lang": "en",
  "code_dir": "SourceCode/",
  "build_JSAV": false,
  "suppress_todo": true,
  "LMS_url": "http://localhost:3000",
  "course_id": 1,
  "chapters": {
    "Preface": {
      "Intro": { "long_name": "Introduction", "sections": {} }
    }
  }
}
JSON
curl -sS -X POST http://localhost:8080/api/configure/ \
  -d config_file_path=config/temp/smoke.json \
  -d build_path=Smoke/Handoff \
  -d rake=false
```

A successful response is `{"ok": true, "message": 0, ...}`; the compiled book
lands in `../OpenDSA-DevStack/opendsa/Books/Smoke/Handoff/html/` and is served
at `http://localhost:8080/Books/Smoke/Handoff/html/index.html`. Note that
`message` is configure.py's exit code, so `ok: true` with a non-zero `message`
is still a failed compile — read `stderr_compressed` in the response.

The `LMS_url`/`course_id` fields are required for the LTI postprocessing step
that the backend triggers (`rake=false` only skips standalone modules), and
modules need at least `"sections": {}`. The shipped configs in a DevStack
checkout can be older than the OpenDSA code and fail validation, so they are
not a reliable smoke test.

## Project Structure (WIP)

Built using Typescript, with Node and Express for the API layer and React and Vite for the course management web UI.
The Web UI React code and Express API layer are each in their own workspaces (web and backend, respectively). The React code is compiled by Vite and served by the Express backend.
The OpenDSA frontend repo will also be included at this level for the backend to draw from to compile books and serve precompiled html for the exercises.
A MySQL server image is started up by docker compose for development profiles, but will be hosted seperately in prod.

Plan to use LTIjs for lti 1.3 authentication management
Plan to use Passport.js for web app login authentication
Plan to use Prisma as an ORM


### Local Database Setup

1. Start MySQL from the repository root:

   ```bash
   docker compose up -d mysql
   ```

2. Navigate to the backend and install dependencies:

   ```bash
   cd apps/backend
   npm install
   ```

3. Create `apps/backend/.env` with:

   ```env
   DATABASE_URL="mysql://root:secret@localhost:3306/lti_db"
   ```

4. Apply the database migrations and generate the Prisma client:

   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

5. Populate the database with sample data:

   ```bash
   npx tsx prisma/seed.ts
   ```

   This seeds a demo organization and CS 1114 course, 50 academic students,
   three staff, five 2023 terms, two dummy LMS instances, six course offerings,
   and 318 enrollments, based on the legacy Rails `db:populate` factories.

   For local development only; rerun one seed process at a time to reuse existing data.

6. Optionally, inspect the database:

   ```bash
   npx prisma studio
   ```

The New Course Offering form loads dropdowns from the database and saves offerings through `POST /api/course-offerings`. Start the backend with `npm run dev` from `apps/backend` and the frontend with `npm run dev:web` from the repository root, then open http://localhost:5173. Book selection and LMS tokens remain disabled; saved offerings can be inspected in Prisma Studio.
