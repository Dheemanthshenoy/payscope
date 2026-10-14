# PayScope — MVP Requirements

**Product:** PayScope · **Customer:** ACME (~10,000 employees, multinational) · **Primary user:** HR Manager

## Problem and goal

ACME HR manages salaries in Excel. Current pay is hard to trust, revision history is fragmented, and questions like “how does pay compare by department or country?” require error-prone manual work.

PayScope’s MVP is a single system of record for **who people are, what they are paid, when pay changed, and how compensation looks by department and country** — with CSV import/export, an audit trail, and HR-only access.

## User persona

**HR Manager** — owns salary accuracy and compensation reporting. Needs to find employees, set or revise pay, inspect history, run department/country analytics, bulk-load or export data, and see who changed what. Does not run payroll, tax, or employee self-service.

## MVP scope

- **Directory:** search, filter, paginate employees
- **Current salary:** view and update amount + currency
- **History:** effective-dated salary revisions (not overwritten)
- **Analytics:** compensation stats by department and by country
- **CSV:** import and export employee/salary data
- **Audit:** who changed salary data, what changed, when
- **Access:** authenticated HR users only

## Acceptance criteria

- **Directory.** HR can search by name or employee id, filter by department and country, and page results without loading all 10,000 employees.
- **Current salary.** Each employee has one current salary (amount + ISO currency). Updating it writes a revision with an effective date and becomes current when that date is today or earlier.
- **History.** HR can view an ordered revision list (amount, currency, effective date, reason). Future-dated revisions do not change current pay until that date.
- **Analytics.** HR can see headcount plus min/max/average/median pay by department and by country. Mixed-currency amounts are never summed, averaged, or ranked as one unit; groups are split or labeled by currency.
- **CSV.** Export includes current directory and current salary. Import creates or updates employees/salaries. Invalid rows fail with a row-level error; valid rows still apply. Unauthenticated import/export is denied.
- **Audit.** Salary create/update/import records actor, timestamp, employee, previous value, and new value. HR can view the trail.
- **Auth.** Unauthenticated access is denied. Only the HR role can read or change compensation data.

## Multi-country compensation

Employees are paid in **local currency** (ISO 4217). Store and display amounts in that currency. MVP does **not** convert FX. Do not aggregate across currencies. Analytics must group by currency within department or country, or show a non-numeric notice when a slice mixes currencies.

## Non-goals

Payroll execution, tax calculations, payslips, attendance, recruitment, employee self-service, bonuses/equity/benefits beyond base salary, FX conversion / corporate reporting currency, and AI-generated SQL.

## Confirmed vs assumed

**Confirmed:** HR-only Excel replacement; directory, current salary, effective-dated history, department/country analytics, CSV, audit, basic HR auth; local currencies with no invalid cross-currency aggregation; non-goals above are excluded.

**Assumptions (need review):** annual **base salary only**; one currency per employee; departments and countries are predefined lists; one seeded HR login (no SSO, no extra HR roles); page size ~25; CSV is the Excel migration path; audit covers salary mutations, not page views; “current” = latest revision with effective date ≤ today.

**Open questions:** Delete vs deactivate employees? Are future-dated revisions required in MVP, or only past/current? Which countries/currencies in seed data? Is import create-and-update or create-only? Analytics as-of a past date, or current snapshot only?

## Why this scope

This set replaces Excel for the HR Manager’s actual questions: find people, trust current pay, see how pay changed, and compare groups without mixing currencies. CSV unblocks a 10k-employee migration. Audit and HR-only auth are the minimum controls for compensation data. Payroll, tax, payslips, attendance, recruiting, self-service, and AI SQL are adjacent systems; they add complexity without solving ACME’s stated problem and would oversize an assessment MVP.
