import { Prisma } from "@prisma/client";
import {
  CurrencyCodeSchema,
  formatAmountMinor,
  numericToDecimalString,
  roundHalfAwayFromZeroInteger,
  type AnalyticsQuery,
  type CompensationAnalytics,
  type CurrencyStats,
} from "@payscope/shared";
import { prisma } from "../db/prisma.js";

type HeadcountRow = {
  group_id: string;
  group_name: string;
  group_code: string | null;
  active_employee_count: number;
  compensated_employee_count: number;
};

type StatRow = {
  group_id: string;
  currency_code: string;
  compensated_employee_count: number;
  minimum_minor: bigint | null;
  maximum_minor: bigint | null;
  average_minor: unknown;
  median_minor: unknown;
  total_minor: unknown;
};

function emptyCurrencyStats(currencyCode: string): CurrencyStats {
  return {
    currencyCode: CurrencyCodeSchema.parse(currencyCode),
    compensatedEmployeeCount: 0,
    minimum: null,
    maximum: null,
    average: null,
    median: null,
    total: "0",
  };
}

function serializeCurrency(row: StatRow): CurrencyStats {
  const count = Number(row.compensated_employee_count);
  if (count === 0 || row.minimum_minor == null || row.maximum_minor == null) {
    return emptyCurrencyStats(row.currency_code.trim());
  }
  return {
    currencyCode: CurrencyCodeSchema.parse(row.currency_code.trim()),
    compensatedEmployeeCount: count,
    minimum: formatAmountMinor(row.minimum_minor),
    maximum: formatAmountMinor(row.maximum_minor),
    average: roundHalfAwayFromZeroInteger(numericToDecimalString(row.average_minor)),
    median: roundHalfAwayFromZeroInteger(numericToDecimalString(row.median_minor)),
    total: roundHalfAwayFromZeroInteger(numericToDecimalString(row.total_minor)),
  };
}

function employeeFilters(query: AnalyticsQuery) {
  return Prisma.sql`
    ${query.departmentId ? Prisma.sql`AND e.department_id = ${query.departmentId}::uuid` : Prisma.empty}
    ${query.countryId ? Prisma.sql`AND e.country_id = ${query.countryId}::uuid` : Prisma.empty}
  `;
}

function currencyFilter(query: AnalyticsQuery) {
  return query.currencyCode
    ? Prisma.sql`AND cr.currency_code = ${query.currencyCode}`
    : Prisma.empty;
}

async function loadGroup(
  query: AnalyticsQuery,
  group: "department" | "country",
): Promise<{ headcounts: HeadcountRow[]; stats: StatRow[] }> {
  const groupId = group === "department" ? Prisma.sql`e.department_id` : Prisma.sql`e.country_id`;
  const groupName = Prisma.sql`g.name`;
  const groupCode = group === "department" ? Prisma.sql`NULL::text` : Prisma.sql`g.code`;
  const orderName = Prisma.sql`g.name ASC`;

  const headcounts = await prisma.$queryRaw<HeadcountRow[]>`
    WITH current_revisions AS (
      SELECT DISTINCT ON (employee_id)
        employee_id,
        amount_minor,
        currency_code
      FROM salary_revisions
      WHERE effective_on <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
      ORDER BY employee_id, effective_on DESC
    )
    SELECT
      ${groupId} AS group_id,
      ${groupName} AS group_name,
      ${groupCode} AS group_code,
      COUNT(*)::int AS active_employee_count,
      COUNT(cr.employee_id) FILTER (
        WHERE cr.employee_id IS NOT NULL
        ${currencyFilter(query)}
      )::int AS compensated_employee_count
    FROM employees e
    ${group === "department"
      ? Prisma.sql`JOIN departments g ON g.id = e.department_id`
      : Prisma.sql`JOIN countries g ON g.id = e.country_id`}
    LEFT JOIN current_revisions cr ON cr.employee_id = e.id
    WHERE e.is_active = TRUE
      ${employeeFilters(query)}
    GROUP BY ${groupId}, ${groupName}${group === "country" ? Prisma.sql`, g.code` : Prisma.empty}
    ORDER BY ${orderName}, ${groupId} ASC
  `;

  const stats = await prisma.$queryRaw<StatRow[]>`
    WITH current_revisions AS (
      SELECT DISTINCT ON (employee_id)
        employee_id,
        amount_minor,
        currency_code
      FROM salary_revisions
      WHERE effective_on <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
      ORDER BY employee_id, effective_on DESC
    ),
    compensated AS (
      SELECT
        e.id AS employee_id,
        ${groupId} AS group_id,
        cr.currency_code,
        cr.amount_minor
      FROM employees e
      JOIN current_revisions cr ON cr.employee_id = e.id
      WHERE e.is_active = TRUE
        ${employeeFilters(query)}
        ${currencyFilter(query)}
    ),
    ranked AS (
      SELECT
        group_id,
        currency_code,
        amount_minor,
        employee_id,
        row_number() OVER (
          PARTITION BY group_id, currency_code
          ORDER BY amount_minor ASC, employee_id ASC
        ) AS rn,
        count(*) OVER (PARTITION BY group_id, currency_code) AS n
      FROM compensated
    ),
    medians AS (
      SELECT
        group_id,
        currency_code,
        avg(amount_minor::numeric)::text AS median_minor
      FROM ranked
      WHERE rn IN ((n + 1) / 2, (n + 2) / 2)
      GROUP BY group_id, currency_code
    )
    SELECT
      c.group_id,
      c.currency_code,
      COUNT(*)::int AS compensated_employee_count,
      MIN(c.amount_minor) AS minimum_minor,
      MAX(c.amount_minor) AS maximum_minor,
      avg(c.amount_minor::numeric)::text AS average_minor,
      m.median_minor::text AS median_minor,
      SUM(c.amount_minor::numeric)::text AS total_minor
    FROM compensated c
    JOIN medians m ON m.group_id = c.group_id AND m.currency_code = c.currency_code
    GROUP BY c.group_id, c.currency_code, m.median_minor
    ORDER BY c.group_id ASC, c.currency_code ASC
  `;

  return { headcounts, stats };
}

function nestGroup(
  headcounts: HeadcountRow[],
  stats: StatRow[],
  kind: "department" | "country",
  currencyFilter: string | undefined,
) {
  const statsByGroup = new Map<string, CurrencyStats[]>();
  for (const row of stats) {
    const list = statsByGroup.get(row.group_id) ?? [];
    list.push(serializeCurrency(row));
    statsByGroup.set(row.group_id, list);
  }

  return headcounts.map((row) => {
    let byCurrency = statsByGroup.get(row.group_id) ?? [];
    if (byCurrency.length === 0 && currencyFilter) {
      byCurrency = [emptyCurrencyStats(currencyFilter)];
    }
    const base = {
      activeEmployeeCount: Number(row.active_employee_count),
      compensatedEmployeeCount: Number(row.compensated_employee_count),
      byCurrency,
    };
    if (kind === "department") {
      return {
        department: { id: row.group_id, name: row.group_name },
        ...base,
      };
    }
    return {
      country: {
        id: row.group_id,
        code: (row.group_code ?? "").trim(),
        name: row.group_name,
      },
      ...base,
    };
  });
}

export async function getCompensationAnalytics(
  query: AnalyticsQuery,
): Promise<CompensationAnalytics> {
  const [departments, countries] = await Promise.all([
    loadGroup(query, "department"),
    loadGroup(query, "country"),
  ]);
  return {
    byDepartment: nestGroup(
      departments.headcounts,
      departments.stats,
      "department",
      query.currencyCode,
    ) as CompensationAnalytics["byDepartment"],
    byCountry: nestGroup(
      countries.headcounts,
      countries.stats,
      "country",
      query.currencyCode,
    ) as CompensationAnalytics["byCountry"],
  };
}
