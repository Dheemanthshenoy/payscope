-- Required audit extension for HR UI identity create/update.
-- The init CHECK only allowed salary actions; identity inserts would fail without this.
ALTER TABLE "audit_logs"
    DROP CONSTRAINT "audit_logs_action_allowed";

ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_action_allowed"
    CHECK ("action" IN (
        'SALARY_CREATE',
        'SALARY_CORRECT',
        'SALARY_IMPORT_CREATE',
        'SALARY_IMPORT_CORRECT',
        'EMPLOYEE_CREATE',
        'EMPLOYEE_UPDATE'
    ));
