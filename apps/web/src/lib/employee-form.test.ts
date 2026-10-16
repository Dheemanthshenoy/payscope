import { describe, expect, it } from "vitest";
import { buildCreateEmployee, buildUpdateEmployee, defaultCreateEmployeeValues } from "./employee-form";

const departmentId = "11111111-1111-4111-8111-111111111111";
const countryId = "22222222-2222-4222-8222-222222222222";

describe("buildCreateEmployee", () => {
  it("trims identity fields and creates an active employee without a salary", () => {
    const result = buildCreateEmployee({
      employeeNumber: "  E-8B-100  ",
      fullName: "  New Nina  ",
      departmentId,
      countryId,
    });
    expect(result.errors).toEqual({});
    expect(result.payload).toEqual({
      employeeNumber: "E-8B-100",
      fullName: "New Nina",
      departmentId,
      countryId,
      isActive: true,
    });
  });

  it("rejects blank, formula-like, and missing lookup values", () => {
    const result = buildCreateEmployee({
      ...defaultCreateEmployeeValues(),
      employeeNumber: "=CMD",
      fullName: "",
    });
    expect(result.payload).toBeUndefined();
    expect(result.errors.employeeNumber).toMatch(/spreadsheet formula/i);
    expect(result.errors.fullName).toMatch(/required/i);
    expect(result.errors.departmentId).toBeTruthy();
    expect(result.errors.countryId).toBeTruthy();
  });
});

describe("buildUpdateEmployee", () => {
  it("accepts name, department, and country only", () => {
    const result = buildUpdateEmployee({
      fullName: "Eve Edited",
      departmentId,
      countryId,
    });
    expect(result.errors).toEqual({});
    expect(result.payload).toEqual({
      fullName: "Eve Edited",
      departmentId,
      countryId,
    });
  });

  it("rejects employeeNumber and isActive so the edit form cannot reactivate", () => {
    const result = buildUpdateEmployee({
      fullName: "Eve Edited",
      departmentId,
      countryId,
      employeeNumber: "E-NEW",
      isActive: true,
    } as never);
    expect(result.payload).toBeUndefined();
    expect(Object.keys(result.errors).length).toBeGreaterThan(0);
  });
});
