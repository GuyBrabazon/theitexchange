# Tech Specs seed data

Import order:
1) system_models.csv
2) component_models.csv
3) compat_rules_global_models.csv

Notes:
- tenant_id blank = global catalog.
- tags use Postgres text[] format (example: {tag1,tag2}).
- meta uses jsonb (use {} for empty).

Validation:
- Run validation.sql after import to spot check rule hits.
