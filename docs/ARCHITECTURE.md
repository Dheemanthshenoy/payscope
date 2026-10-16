# PayScope — Architecture

Assessment MVP. Source of truth: `docs/REQUIREMENTS.md`. This document is **proposed design**, not Incubyte-stated. Where the requirements are silent or internally tense, see **Open decisions and risks** — those items are not silently filled in as product fact.

## 1. Architecture

Lightweight **npm workspaces** monorepo. **Modular monolith**: one deployable API, one web app, one PostgreSQL database. No microservices, message bus, job queue, or cache tier.

```
payscope/
  apps/web          Next.js, TypeScript, Tailwind CSS, shadcn/ui
  apps/api          Node.js, Express, TypeScript, Prisma
  packages/shared   Zod schemas and TypeScript contracts
```

**apps/web.** HR UI only (directory, employee detail / history, analytics, CSV, audit, login). Talks to the API through **same-origin** `/api/*` rewrites so session cookies are first-party in development and in a reverse-proxied deployment.

**apps/api.** Express modular monolith. Modules (folders, not services): `auth`, `employees`, `salaries`, `analytics`, `csv`, `audit`. Each module owns routes, Prisma access, and tests. Cross-module rules (current salary, currency scale) live in `packages/shared` and/or a small domain layer used by the API.

**packages/shared.** Zod schemas and inferred types for auth, employees, salary revisions, analytics DTOs, CSV rows, pagination, and error envelopes. API validates with these schemas; web uses the types. No Prisma, no React.

**Data.** PostgreSQL via Prisma. Analytics that need window functions / `FILTER` use Prisma `$queryRaw` against the same database.

**Runtime shape.** One Node API process + Next.js + Postgres. Seed script runs against the API database (`prisma db seed` or `apps/api` script) and loads **10,000 employees**.

```
Browser  →  Next.js (apps/web)  →  /api/* rewrite  →  Express (apps/api)  →  PostgreSQL
```

## 2. Data model

UUIDs for surrogate keys. Lookups (`Department`, `Country`) are seeded; no admin CRUD in MVP.

### Department

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `name` | text | `UNIQUE NOT NULL` |
| `created_at` | timestamptz | `NOT NULL` |

Seed names: Engineering, Product, Design, Sales, Marketing, Finance, HR, Operations, Support.

### Country

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `code` | char(2) | `UNIQUE NOT NULL` (ISO 3166-1 alpha-2: IN, US, GB, AE, DE) |
| `name` | text | `UNIQUE NOT NULL` |
| `created_at` | timestamptz | `NOT NULL` |

Seed: India, US, UK, UAE, Germany. Currency is **not** stored here; it lives on `SalaryRevision` so a revision can use any ISO 4217 code. Country does not constrain salary currency (see risks).

### Employee

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `employee_number` | text | `UNIQUE NOT NULL` — directory “employee id” |
| `full_name` | text | `NOT NULL` |
| `department_id` | uuid | `NOT NULL` FK → Department |
| `country_id` | uuid | `NOT NULL` FK → Country |
| `is_active` | boolean | `NOT NULL DEFAULT true` |
| `deactivated_at` | timestamptz | null while active |
| `created_at` | timestamptz | `NOT NULL` |
| `updated_at` | timestamptz | `NOT NULL` |

No hard delete. Deactivate sets `is_active = false` and `deactivated_at`. Current salary is **not** a column; it is derived (section 3).

**Indexes:** unique `employee_number` (exact lookup); `(department_id)`; `(country_id)`; `(is_active)` for the default directory filter. A B-tree on `full_name` does **not** help leading-wildcard `ILIKE '%q%'`. At 10k rows a sequential scan for name search is acceptable; keep that simple approach — no `pg_trgm`, no search engine. Prefer exact `employee_number` match when `q` looks like an id.

**Relationships:** Employee N:1 Department, N:1 Country; 1:N SalaryRevision; 1:N AuditLog.

### SalaryRevision

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `employee_id` | uuid | `NOT NULL` FK → Employee `ON DELETE RESTRICT` |
| `amount_minor` | bigint | `NOT NULL CHECK (amount_minor >= 0)` |
| `currency_code` | char(3) | `NOT NULL` (ISO 4217) |
| `effective_on` | date | `NOT NULL` — UTC calendar date, no time |
| `reason` | text | `NOT NULL` on correction; optional on first insert for that date |
| `version` | integer | `NOT NULL DEFAULT 1` — optimistic concurrency |
| `created_at` | timestamptz | `NOT NULL` |
| `updated_at` | timestamptz | `NOT NULL` (same-date corrections) |

**Unique:** `(employee_id, effective_on)` — one revision per employee per effective date.

**Indexes:** unique `(employee_id, effective_on DESC)` (supports current-salary lookup).

Same-date correction **updates** this row in place (`version = version + 1`); it does not insert a second revision. Stale `version` → no row updated → **409 Conflict** (section 3).

### HRUser

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `email` | citext | `UNIQUE NOT NULL` |
| `password_hash` | text | `NOT NULL` |
| `role` | text | `NOT NULL CHECK (role = 'HR')` |
| `created_at` | timestamptz | `NOT NULL` |

HR users are **not** employees. One seeded HR login. No extra roles.

Sessions (if stored server-side): table managed by the session library (e.g. `connect-pg-simple`) or a Prisma `Session` model (`sid`, `sess` jsonb, `expire`). Not a domain entity.

### AuditLog

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `actor_id` | uuid | `NOT NULL` FK → HRUser |
| `employee_id` | uuid | `NOT NULL` FK → Employee |
| `salary_revision_id` | uuid | FK → SalaryRevision (nullable if we ever log a failed path; normal writes set it) |
| `action` | text | `NOT NULL` — `SALARY_CREATE` \| `SALARY_CORRECT` \| `SALARY_IMPORT_CREATE` \| `SALARY_IMPORT_CORRECT` \| `EMPLOYEE_CREATE` \| `EMPLOYEE_UPDATE` |
| `previous_value` | jsonb | null on create; snapshot on correct |
| `new_value` | jsonb | `NOT NULL` — salary: `{ amountMinor, currencyCode, effectiveOn, reason, version }` with `amountMinor` as a JSON string; identity: `{ employeeNumber, fullName, departmentId, countryId, isActive }` |
| `created_at` | timestamptz | `NOT NULL DEFAULT now()` |

**Append-only at the database, not only in app code:** no `updated_at`; the app role is granted `SELECT, INSERT` only (no `UPDATE`/`DELETE`); a `BEFORE UPDATE OR DELETE` trigger raises an exception. Indexes: `(employee_id, created_at DESC)`; `(created_at DESC)` for a global trail.

Requirements: audit **salary mutations** and **HR UI identity create/update**. Employee field changes via CSV still do not write `EMPLOYEE_*` rows unless they accompany a salary write (see open decisions). The init migration CHECK allowed salary actions only; Milestone 8B adds `EMPLOYEE_CREATE` and `EMPLOYEE_UPDATE` to that CHECK before any identity audit insert.

### Relationship summary

```
Department 1──< Employee >──1 Country
                 │
                 ├──< SalaryRevision   UNIQUE (employee_id, effective_on)
                 └──< AuditLog
HRUser 1──< AuditLog
```

## 3. Salary invariants

Enforced in the database **and** in `packages/shared` (Zod + pure functions). Tests target the shared rules.

| Rule | Enforcement |
| --- | --- |
| Annual base salary only | Domain: this table is the only pay field |
| Integer minor units | `amount_minor` bigint; API/CSV convert major → minor using ISO 4217 exponent |
| ISO 4217 codes | `currency_code` char(3); shared allow-list (seed: INR, USD, GBP, AED, EUR, exponent 2) |
| One revision per employee per date | `UNIQUE (employee_id, effective_on)` |
| UTC date-only effective dates | `date` column; interpret as UTC calendar date, not session TZ |
| Current salary | Derived, not stored: latest `effective_on <= utc_today` |
| Future revisions | Stored; excluded from current pay and current-snapshot analytics |
| Same-date correction | `UPDATE` existing row where `version` matches; insert AuditLog with old/new; `reason` required |
| Optimistic concurrency | Client sends `version`; `UPDATE … WHERE version = $v`; 0 rows → 409; no audit insert |
| Mutation + audit atomic | Single transaction: revision write and audit insert commit or roll back together |
| Bigint in JSON | `amountMinor` serialized as a **decimal string** (never JS `number`) |

**UTC today** (do **not** use PostgreSQL `CURRENT_DATE`, which follows session TimeZone):

```sql
(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
```

**Current salary lookup** (per employee or as a join for lists):

```sql
SELECT DISTINCT ON (employee_id) *
FROM salary_revisions
WHERE effective_on <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
ORDER BY employee_id, effective_on DESC;
```

Employees with no qualifying row: current salary **unset**; they remain in the directory; they are excluded from salary statistics.

**Write paths**

1. **New effective date** — `INSERT` revision (`version = 1`) + `INSERT` audit (`SALARY_CREATE`) in one transaction. No `version` required from the client.
2. **Same `effective_on` (UI)** — client sends the `version` from the last read plus a **required** `reason`. In one transaction: `UPDATE salary_revisions SET …, version = version + 1 WHERE id = $id AND version = $clientVersion`; if `rowCount = 0`, **rollback** and return **409** (no audit row). If the update succeeds, `INSERT` audit (`SALARY_CORRECT`, previous_value + new_value) in the same transaction. Two HR sessions correcting the same row: first commit wins; second gets 409 and must re-fetch.
3. **CSV** — **parse and validate entirely outside any transaction** (schema, currencies, scales, FK names, intra-file duplicates). Duplicate `employee_number` + `effective_on` **inside the file** fail the whole file (row-level errors on each duplicate). If any row is invalid, write nothing.

   After validation, **snapshot** `id` + `version` for every existing `(employee_number, effective_on)` the file would update. Then **one transaction**: batched employee upserts and batched revision insert/update + audit inserts (`COPY` / multi-row `INSERT` / temp table). Each update is `UPDATE … SET …, version = version + 1 WHERE id = $id AND version = $snapshotVersion`. If any update returns 0 rows, or an insert hits `UNIQUE (employee_id, effective_on)` (a revision appeared after the snapshot), **rollback the entire transaction** and return **409** `{ code: "CONFLICT", details: { rows: [{ employeeNumber, effectiveOn, message }] } }` — no partial import, no last-commit-wins against a concurrent UI correction. Do not use `skipDuplicates`. Same pair already in the DB with a matching snapshot version is an intentional create-and-update.

Do **not** denormalize current amount onto `Employee`. At UTC midnight a future revision may become current with **no write**; a cached column would be stale unless a job exists (rejected for this MVP). No Redis/cache layer.

## 4. Analytics

Current snapshot only. All aggregations in PostgreSQL. No load-then-reduce in Node.

**Interpretation of grouping** (requirements AC vs “group by department, country, and currency”):

- **Department view:** one row per department. `employee_headcount` = active employees in that department (including those with no current salary). Nested **by currency**: `compensated_headcount` + min/max/average/median/total for active employees whose **current** salary is that currency.
- **Country view:** same shape, grouped by country.
- Uncompensated employees appear in department/country **employee headcount only**. They are **not** placed in a currency slice and are **not** in min/max/avg/median/total.
- **Never** `SUM`/`AVG`/median across mixed `currency_code` values. No FX.

Compensated = active AND has a current revision (`effective_on <= utc_today`).

**Database-side stats** (per group × currency, compensated only):

- min / max / total: `MIN`, `MAX`, `SUM(amount_minor::numeric)`
- average: `AVG(amount_minor::numeric)`
- median: **not** `percentile_cont` (that ordered-set aggregate is `double precision`, not arbitrary-precision `numeric`). Exact median per department/country × currency group:

```sql
-- n odd → middle row; n even → avg of the two middle rows
row_number() OVER (PARTITION BY group_keys ORDER BY amount_minor, employee_id) AS rn,
count(*)     OVER (PARTITION BY group_keys) AS n
-- keep rows where rn IN ( (n + 1) / 2, (n + 2) / 2 )
-- then avg(amount_minor::numeric) per group
```

Keep the SQL result as `numeric` (may have a `.5` for even n). **Round to integer minor units only at the API presentation boundary** (half-away-from-zero), then serialize as a string.

Implementation: join employees to “current revision” subquery (`DISTINCT ON` or `LATERAL`), `WHERE employee.is_active`, then aggregate per `department_id, currency_code` (and separately `country_id, currency_code`). Employee headcount is a separate `COUNT(*)` grouped by department/country **without** requiring a salary join (or `COUNT(*)` vs `COUNT(revision.id)` on a left join).

## 5. API design

JSON REST, same-origin `/api`. All routes except login require a valid session and `role = HR`. Shared Zod schemas validate body/query; never trust the client.

**Conventions**

- Pagination: `page` (1-based), `pageSize` default **25**, max 100. List envelope: `{ data, page, pageSize, totalCount }`.
- Errors: `{ error: { code, message, details? } }`. Codes include `VALIDATION`, `CSRF`, `CONFLICT`, `CSV_INVALID`.
- CSV reject (400): `{ error: { code: "CSV_INVALID", message, details: { rows: [{ rowNumber, field, message }] } } }`. Duplicate employee/date rows each appear in `details.rows`. **No** partial insert. CSV concurrency conflict (409): `{ error: { code: "CONFLICT", message, details: { rows: [{ employeeNumber, effectiveOn, message }] } } }` — entire import rolled back. Success (200): `{ imported: { employees, revisions } }` after commit.
- Dates: `effectiveOn` as `YYYY-MM-DD` (UTC date). Money: `amountMinor` as a **string** of decimal digits + `currencyCode`; web parses with bigint/decimal and formats major units. Never `JSON.parse` money into `number`.
- Authorization: missing/invalid session → 401. HR-only (only role in MVP).
- IDs: UUID in paths; directory search uses `employee_number` and name.
- Concurrency: list/detail payloads include `currentSalary.version` and each history row’s `version`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | email + password; Origin check; regenerate session id; Set-Cookie |
| POST | `/api/auth/logout` | destroy session |
| GET | `/api/auth/me` | current HR user |
| GET | `/api/departments` | filter dropdown |
| GET | `/api/countries` | filter dropdown |
| GET | `/api/employees` | directory: `q`, `departmentId`, `countryId`, `status=active\|inactive\|all` (default **active**), pagination. Include derived current salary or null. DB `LIMIT/OFFSET` or keyset; offset is fine at 10k. |
| POST | `/api/employees` | create identity (employee number, name, department, country, optional `isActive`). No salary required. Duplicate employee number → 409. Writes `EMPLOYEE_CREATE` audit. |
| GET | `/api/employees/:id` | detail + derived current salary |
| PATCH | `/api/employees/:id` | edit name, department, country. Employee number is immutable. Does not accept `isActive` (no reactivate). Meaningful changes write `EMPLOYEE_UPDATE` audit. |
| PATCH | `/api/employees/:id/deactivate` | `is_active=false` (no hard delete). Architecture originally said POST; implemented as PATCH. |
| GET | `/api/employees/:id/salary-revisions` | history, all dates, newest first |
| POST | `/api/employees/:id/salary-revisions` | create a new effective date (`version` omitted). Duplicate date → 409. |
| PATCH | `/api/employees/:id/salary-revisions/:revisionId` | same-date correction: require `expectedVersion` + `reason`; stale version → 409, no audit. |
| GET | `/api/analytics/compensation` | current snapshot: by department and by country, nested currency stats + both headcounts (money fields as strings) |
| GET | `/api/employees/export` | CSV of current directory + current salary (`text/csv`) |
| POST | `/api/employees/import` | multipart CSV; validate outside txn; version-snapshot updates; all-or-nothing batched commit; stale version or unique race → 409, full rollback |
| GET | `/api/employees/:id/audit-logs` | per-employee identity and salary audit, paginated |
| GET | `/api/audit-logs` | global salary audit, paginated |

**Employee create/edit UI — decision: included.** HR can create an employee without a salary and later add revisions. Edit covers name, department, and country only. Employee number is immutable. Reactivate remains out of MVP. Identity writes from this UI are audited (`EMPLOYEE_CREATE` / `EMPLOYEE_UPDATE`) after extending `audit_logs_action_allowed`. CSV identity edits remain unaudited unless they accompany a salary write.

**CSV canonical header** (see `docs/samples/employees.sample.csv`):

```
employee_number,full_name,department,country,is_active,effective_on,amount,currency_code,reason
```

`amount` is **major units** with at most 2 decimal places, parsed as integer minor units (no `Number()` / float). `country` accepts the seeded name (`India`, `US`, `UK`, `UAE`, `Germany`) or ISO code (`IN`, `US`, `GB`, `AE`, `DE`). `is_active` accepts `true`/`false` (also `1`/`0`, `yes`/`no`, `active`/`inactive`). Intra-file duplicate `employee_number` **or** `employee_number`+`effective_on` → whole-file reject. Same pair already in the DB → update that revision (import correct) + audit. `reason` required when the row corrects an existing date. Rows with empty salary fields may upsert the employee and leave salary unset. Import will **deactivate** (`is_active=false`) but will **not reactivate**. Identity fields (name, department, country) are updated. Fields that look like spreadsheet formulas (`=`, `+`, `-`, `@`) are rejected on import and prefixed with `'` on export.

## 6. Security

- **Sessions:** server-side session in PostgreSQL. Cookie: `HttpOnly`, `Secure` (production HTTPS), `SameSite=Lax`, `Path=/`. Idle lifetime **8 hours**. After successful login, **regenerate the session id** then store `userId` (prevents fixation). Logout destroys the session.
- **Same origin:** Next.js rewrites `/api` → Express so the cookie is first-party.
- **CSRF:** `SameSite` is not enough. `Host` is the **target** of the request, not its origin — a CSRF POST still carries the victim `Host`, so a matching `Host` is **not** proof of origin. For every unsafe method (`POST`/`PATCH`/`PUT`/`DELETE`, including login, salary writes, import, deactivate, logout), require `Origin` to be present and equal to the configured app origin (`scheme://host[:port]`). Missing `Origin` or untrusted `Origin` → 403 `{ code: "CSRF" }`. Do not fall back to `Host`. The only exception is a **documented trusted non-browser caller** that cannot send `Origin` (none in the browser HR app; the seed script talks to Postgres directly, not the cookie API). No extra CSRF-token service. Split-site deployment is out of scope.
- **Passwords:** **Argon2id**. Seeded HR password from env; not committed.
- **RBAC:** `HR` on every compensation read/write. No employee self-service.
- **Validation:** Zod on the server. CSV validated **before** the write transaction.
- **Rate limiting:** strict on `POST /api/auth/login`. Coarser limit + file-size cap on import.
- **Headers:** `helmet` on Express.
- **Audit:** append-only grants + trigger (section 2); HR can read the trail.

## 7. Performance

Target: 10,000 employees, ~tens of thousands of revisions, modest hosted Postgres.

| Concern | Strategy |
| --- | --- |
| Directory | `WHERE` + `ORDER BY` + `LIMIT/OFFSET` in SQL; default `is_active = true` |
| Search | exact `employee_number` uses the unique B-tree. Name `ILIKE '%q%'` will seq-scan at 10k — acceptable; do not pretend a B-tree on `full_name` makes it index-only |
| Current salary on list | `LEFT JOIN LATERAL` / `DISTINCT ON`; no N+1 |
| Analytics | SQL `GROUP BY` currency; exact median via `row_number` / `count` / `avg(numeric)` |
| Import | parse/validate **outside** the transaction; snapshot versions; one transaction of **batched** OCC updates; integration-test a **10,000-row** file (success, duplicate-reject, concurrent 409) |
| UTC rollover | derived reads; no cache |
| App memory | never load all employees into Node for filter/page/aggregate |

Expected: paged directory and analytics over 10k rows in tens to low hundreds of milliseconds on a small instance if queries stay in Postgres. No Redis, no read replicas for MVP.

## 8. Testing

**Unit** (`packages/shared` and API domain, no DB): current-revision selection vs UTC date; future revisions ignored; same-date correction vs new date; required correction `reason`; currency exponent / minor-unit conversion; bigint string serialization; reject mixed-currency totals; CSV validation including intra-file employee/date duplicates; pagination defaults.

**Integration** (test Postgres): unique `(employee_id, effective_on)`; OCC: concurrent corrections → one commit, one 409, single audit row for the winner; mutation+audit commit and **roll back together**; audit `UPDATE`/`DELETE` rejected by trigger/grants; import: validate-then-txn, 10,000-row success, duplicate-in-file reject with no writes, concurrent UI correction during import → 409 and **zero** imported rows; directory default active + filters; analytics exact median (odd n and even n) and per-currency stats; auth 401; CSRF missing/untrusted Origin → 403; `Host`-only request without Origin → 403; session id changes after login.

**E2E** (small Playwright set): login success/failure; directory default active, search/filter; open employee, add revision, see current vs future; analytics currency-separated groups; CSV reject invalid file with row errors; unauthenticated user cannot open directory.

Incubyte asks for **unit tests**; integration and a thin E2E layer back the salary/transaction invariants the brief does not name.

## 9. Trade-offs

| Choice | Why | Rejected |
| --- | --- | --- |
| Modular monolith | One HR app, one data model, assessment time-box; 10k rows do not need service boundaries | Microservices / separate salary service — ops and consistency cost with no scale benefit |
| PostgreSQL | Relational FKs, unique (employee, date), transactions for import+audit, `FILTER` / window-function median | Mongo/document — weak invariants and mixed-currency accidents; spreadsheets — the problem |
| Prisma | Typed access, migrations, seed, fast CRUD | Drizzle/Kysely — fine but extra familiarity cost; Prisma-only for analytics — rejected, use `$queryRaw` for median |
| npm workspaces | Shared Zod/types without publishing packages; little tooling | Turborepo/Nx — extra config; polyrepo — contract drift |
| Next.js + Express | Brief wants working frontend **and** backend; Express is easy to test; Next stays UI | Next.js Route Handlers only — blurs API boundary; GraphQL — extra surface for CRUD |
| Derived current salary | UTC midnight correctness without jobs | Column on Employee — stale at date change; materialized view — extra moving part |
| Session cookies | HTTP-only, no token in localStorage | JWT in localStorage — XSS; SSO — out of scope |
| Origin-checked CSRF | Fits same-origin rewrite deploy; no extra token store | CSRF tokens / double-submit — more moving parts than needed if Origin is enforced |
| OCC `version` | Two HR tabs will not silently clobber a correction | Pessimistic locks / queues — extra infra for a rare conflict |
| All-or-nothing CSV | Matches requirements; avoids half-imported 10k files | Per-row commit — rejected by requirements |
| Employee create/edit UI | HR must add and correct identity without a spreadsheet; employee number stays immutable | Reactivate / hard-delete — still out of MVP |

## Open decisions and risks

**Resolved assumptions (still not Incubyte-stated):**

- **Correction `reason`:** required on same-date corrections (API and CSV). Optional on first insert for that date.
- **CSV duplicates:** intra-file duplicate `employee_number` or `employee_number` + `effective_on` reject the **entire** file with row-level errors. The same pair already in the DB is an update, not a duplicate error.
- **Session lifetime:** 8-hour idle expiry; regenerate id on login.
- **Median:** exact `avg(amount_minor::numeric)` of the middle one or two rows per group (`row_number` + `count`); round to integer minor units only when presenting the API response.
- **Employee create/edit form:** included (POST/PATCH employees; no reactivate); see section 5.
- **Money JSON:** `amountMinor` as string.
- **CSV amount:** major units; columns listed in section 5.

**Still open:**

1. **CSV extras** — resolved: import may change department/country, may deactivate, and may omit salary. It will not reactivate.
2. **Reactivate** — deactivate is specified; restore-to-active is not (API or CSV).
3. **Email / title / hire date** — omitted from the model on purpose.
4. **Currency vs country** — a US employee with INR pay is allowed; analytics will show that currency slice.
5. **Audit of non-salary CSV fields** — UI identity create/update is audited. CSV name/department/country edits still may be unaudited unless they accompany a salary write.
6. **Audit UI** — both per-employee and global endpoints; requirements only say HR can view the trail.
7. **Deployment host** — brief requires deployment; provider is open. Origin allowlist and `Secure` cookies assume HTTPS + same-site proxy.
8. **Employee number format** — opaque unique string.

If CSV identity rules (1) or reactivate (2) must change before implementation, update `REQUIREMENTS.md` first.

## 10. Implementation notes (Milestones 6–7)

**Analytics grouping.** `GET /api/analytics/compensation` returns `{ byDepartment, byCountry }`. Each group includes `activeEmployeeCount` (active employees, including unpaid) and `compensatedEmployeeCount` (active with a current UTC-effective salary, after optional `currencyCode` filter). Pay stats are nested `byCurrency` and never mixed. Empty compensated groups serialize `minimum`/`maximum`/`average`/`median` as `null` and `total` as `"0"`. Optional filters: `departmentId`, `countryId`, `currencyCode`.

**Money precision.** SQL uses `amount_minor::numeric` for `AVG`, `SUM`, and the window median (`row_number` + `count` + `avg` of the middle one or two rows). PostgreSQL `percentile_cont` is not used. Average and median are rounded to integer minor units **only at the API boundary**, half away from zero, then serialized as decimal strings. Min/max/total are already integer minor units.

**CSV transport.** Import is `POST /api/employees/import` (`multipart/form-data`, field name `file`, default 2 MiB / 10,000 rows, coarse rate limit). Validate-then-one-transaction. Success envelope data is `{ imported: { employees, revisions } }`. Export is `GET /api/employees/export` (`text/csv`) using the same directory filters, batched 200 rows, current salary only. Export does not use the JSON `sendSuccess` envelope.

**Seed.** Explicit only: `npm run db:seed -w @payscope/api -- --confirm` with `PAYSCOPE_SEED_CONFIRM=PAYSCOPE_SEED`. Not registered as `prisma.seed` and not run on API startup or migrate. Test databases require `--allow-test`. Generates 10,000 `SEED-00001`… employees across the documented countries/departments; reruns skip manually renamed seed employees and never update existing revision rows.

**Global audit.** `GET /api/audit-logs` is not implemented; per-employee `GET /api/employees/:id/audit-logs` is.

**Known limitations.** Name search is `ILIKE '%q%'` (seq scan at 10k). CSV import updates employees row-by-row inside one transaction (fine at 10k, not a COPY path). Seed country/department upserts use canonical names. A US employee may have INR pay. Non-salary CSV identity edits are not audit-logged.
