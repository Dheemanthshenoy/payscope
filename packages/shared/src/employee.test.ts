import { describe, expect, it } from "vitest";
import { CreateEmployeeSchema, UpdateEmployeeSchema } from "./employee.js";

const departmentId = "11111111-1111-4111-8111-111111111111";
const countryId = "22222222-2222-4222-8222-222222222222";

describe("CreateEmployeeSchema", () => {
  it("trims identity fields and defaults isActive", () => {
    const parsed = CreateEmployeeSchema.parse({
      employeeNumber: "  E-100  ",
      fullName: "  Ada Lovelace  ",
      departmentId,
      countryId,
    });
    expect(parsed).toEqual({
      employeeNumber: "E-100",
      fullName: "Ada Lovelace",
      departmentId,
      countryId,
      isActive: true,
    });
  });

  it("rejects blank or formula-like identity values", () => {
    expect(CreateEmployeeSchema.safeParse({
      employeeNumber: "",
      fullName: "Ada",
      departmentId,
      countryId,
    }).success).toBe(false);
    expect(CreateEmployeeSchema.safeParse({
      employeeNumber: "=HYPERLINK",
      fullName: "Ada",
      departmentId,
      countryId,
    }).success).toBe(false);
  });
});

describe("UpdateEmployeeSchema", () => {
  it("accepts name, department, and country only", () => {
    expect(UpdateEmployeeSchema.parse({
      fullName: "Ada Lovelace",
      departmentId,
      countryId,
    })).toEqual({
      fullName: "Ada Lovelace",
      departmentId,
      countryId,
    });
  });

  it("rejects employeeNumber and isActive so PATCH cannot rename or reactivate", () => {
    expect(UpdateEmployeeSchema.safeParse({
      employeeNumber: "E-200",
      fullName: "Ada Lovelace",
      departmentId,
      countryId,
    }).success).toBe(false);
    expect(UpdateEmployeeSchema.safeParse({
      fullName: "Ada Lovelace",
      departmentId,
      countryId,
      isActive: true,
    }).success).toBe(false);
  });
});
