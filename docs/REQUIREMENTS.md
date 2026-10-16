# PayScope — MVP Requirements

**Product:** PayScope · **Customer:** ACME (~10,000 employees, multinational) · **Primary user:** HR Manager  
**Assessment:** Incubyte Software Craftsperson / Node / React / TypeScript II

## Problem and goal

ACME HR tracks salaries in spreadsheets. Current pay is hard to trust, history is fragmented, and org-wide comparisons are manual. PayScope is a **web-based** system of record for **who people are, what they are paid, when pay changed, and how compensation looks across the organization**.

## User persona

**HR Manager** — finds employees, sets or revises pay, inspects history, runs compensation analytics, imports/exports CSV, and sees who changed what. Does not run payroll, tax, or employee self-service.

## Explicitly stated assessment requirements

From the Incubyte brief (not our product design): a **web-based** salary-management app for **~10,000 multinational employees**; **HR Manager** as primary user; help HR **answer organizational compensation questions**; **working frontend and backend**; a **10,000-employee seed script**; **deployment**; a **demo video**; **unit tests**; **incremental commits**; and this **one-page requirements document**.

## Proposed MVP (our design — not confirmed by Incubyte)

- **Directory:** search, filter, pagination. Default list is **active** employees; inactive remain findable via filter. HR can **create** employees and **edit** name, department, and country. **Employee number is immutable** after create. **Deactivate**; do not hard-delete or reactivate.
- **Salary:** annual **base salary only**. Store as **integer minor units** + **ISO 4217** code, using that currency’s decimal scale (INR/USD/GBP/AED/EUR = 2). **Current salary** = latest revision with effective **UTC calendar date ≤ today (UTC)**. **One revision per employee per effective date.** A **same-date correction** updates that revision; old and new values go to an **immutable audit log**. **Future-dated revisions** stay in history and do **not** affect current pay or analytics. No current revision → salary unset; employee stays in the directory.
- **Analytics:** current snapshot, grouped by **department, country, and currency**. **Employee headcount** = all active employees in the group. **Compensated headcount** = active employees with a current salary. Min, max, average, median, and **total** use **compensated** employees only. Never mix currencies. Employees without a current salary count in department/country employee headcount, not in any currency slice or salary stat.
- **CSV:** export current directory + current salary. Import **validates the whole file** and commits **all rows in one transaction** only if every row is valid; otherwise reject with **row-level errors**.
- **Audit / auth:** salary create/update/import and employee identity create/update record actor, time, employee, previous and new values. HR login required; no SSO or extra roles.
- **Performance:** pagination, filtering, and aggregation run **in the database** at ~10,000 employees.
- **Seed:** 10,000 employees across **India, US, UK, UAE, Germany** (INR, USD, GBP, AED, EUR) and departments **Engineering, Product, Design, Sales, Marketing, Finance, HR, Operations, Support**. One seeded HR login.

## Acceptance criteria

- **Directory.** Search by name or employee id; filter by department, country, and active/inactive; **paginate in the database**. Default view is active. HR can create an employee without a salary and edit name/department/country. Employee number cannot change after create. Deactivated employees stay findable; no reactivate.
- **Current salary.** Latest revision with effective UTC date ≤ today UTC (major units on screen; minor units + currency in storage). Unset if none. Same-date correction updates the existing revision and writes old/new values to the audit log. A new effective date creates a new revision.
- **History.** Ordered list (amount, currency, effective date, reason), including future dates. Future revisions are not current and are omitted from current-snapshot analytics.
- **Analytics.** Current snapshot **aggregated in the database**. Per department/country (and currency for pay stats): employee headcount (active), compensated headcount (active with current salary), plus min, max, average, median, total on compensated employees only. No mixed-currency totals, averages, or ranks.
- **CSV.** Authenticated export. Import is all-or-nothing: validate every row, then commit all or none, with row-level errors on reject.
- **Audit / auth.** Salary mutations and employee identity create/update are logged immutably. Unauthenticated access is denied; only HR can read or change compensation data.
- **Scale.** Directory pagination/filtering and analytics aggregation stay database-backed and correct at 10,000 employees.

## Non-goals

Proposed exclusions (not Incubyte-stated): payroll, tax, payslips, attendance, recruitment, employee self-service, AI-generated SQL, bonuses/equity/benefits, FX conversion, as-of-date analytics, partial CSV commits, hard delete, extra HR roles.

## Assumptions

Proposed, not Incubyte-confirmed: rules in Proposed MVP; **UTC** for effective dates; same-date **in-place correction** with immutable audit; default directory **active only**; seed departments listed above; CSV create-and-update; audit of salary mutations **and** HR UI identity create/update; page size ~25.
