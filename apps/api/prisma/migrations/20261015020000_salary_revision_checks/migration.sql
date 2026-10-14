-- Additional salary_revisions CHECKs (do not edit 20261015000000_init).
ALTER TABLE "salary_revisions"
    ADD CONSTRAINT "salary_revisions_version_positive"
    CHECK ("version" >= 1);

ALTER TABLE "salary_revisions"
    ADD CONSTRAINT "salary_revisions_currency_code_allowed"
    CHECK ("currency_code" IN ('INR', 'USD', 'GBP', 'AED', 'EUR'));
