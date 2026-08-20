from django.db import migrations


TABLE_RENAMES = (
    ("Institute", "institutes_institute", "institutes"),
    ("Branch", "institutes_branch", "branches"),
    ("InstituteDocument", "institutes_institutedocument", "institute_documents"),
    ("SubscriptionPlan", "institutes_subscriptionplan", "subscription_plans"),
    ("InstituteSubscription", "institutes_institutesubscription", "institute_subscriptions"),
    (
        "InstituteConsentRecord",
        "institutes_instituteconsentrecord",
        "institute_consent_records",
    ),
    ("InstituteMembership", "institutes_institutemembership", "institute_memberships"),
)

# Children must be dropped before their empty legacy parents. PostgreSQL
# updates the current tables' own FK references when those tables are renamed.
LEGACY_TARGET_DROP_ORDER = (
    "institute_documents",
    "institute_subscriptions",
    "institute_memberships",
    "institute_consent_records",
    "branches",
    "subscription_plans",
    "institutes",
)


def rename_to_unprefixed_tables(apps, schema_editor):
    """Replace empty legacy tables and retain their foreign-key contracts.

    An existing table with data is deliberately treated as a migration error:
    silently deleting or merging a differently shaped legacy schema would risk
    losing data.
    """
    connection = schema_editor.connection
    quote_name = connection.ops.quote_name
    with connection.cursor() as cursor:
        existing = set(connection.introspection.table_names(cursor))
        target_tables = {target for _, _, target in TABLE_RENAMES}
        conflicting_targets = target_tables.intersection(existing)
        for table_name in conflicting_targets:
            cursor.execute(f"SELECT 1 FROM {quote_name(table_name)} LIMIT 1")
            if cursor.fetchone() is not None:
                raise RuntimeError(
                    f"Cannot rename institute tables: legacy table '{table_name}' contains data. "
                    "Migrate that data explicitly before applying this migration."
                )
        # Existing legacy tables can be referenced by other legacy tables.
        # PostgreSQL keeps exact FK and RLS policy definitions available, so
        # detach only external dependencies, replace the empty tables, then
        # restore the dependencies against the newly renamed current tables.
        foreign_keys = []
        policies = []
        if conflicting_targets:
            if connection.vendor != "postgresql":
                raise RuntimeError(
                    "Cannot replace conflicting legacy tables on this database backend. "
                    "Use PostgreSQL or remove the empty legacy tables first."
                )
            cursor.execute(
                """
                SELECT source_namespace.nspname, source_table.relname, fk_constraint.conname,
                       pg_get_constraintdef(fk_constraint.oid)
                FROM pg_constraint AS fk_constraint
                JOIN pg_class AS target_table ON target_table.oid = fk_constraint.confrelid
                JOIN pg_namespace AS target_namespace ON target_namespace.oid = target_table.relnamespace
                JOIN pg_class AS source_table ON source_table.oid = fk_constraint.conrelid
                JOIN pg_namespace AS source_namespace ON source_namespace.oid = source_table.relnamespace
                WHERE fk_constraint.contype = 'f'
                  AND target_namespace.nspname = current_schema()
                  AND target_table.relname = ANY(%s)
                """,
                [list(conflicting_targets)],
            )
            foreign_keys = [
                row for row in cursor.fetchall() if row[1] not in conflicting_targets
            ]
            for schema, table, constraint_name, _ in foreign_keys:
                cursor.execute(
                    f"ALTER TABLE {quote_name(schema)}.{quote_name(table)} "
                    f"DROP CONSTRAINT {quote_name(constraint_name)}"
                )
            cursor.execute(
                """
                SELECT DISTINCT policy_namespace.nspname, policy_table.relname, policy.polname,
                       policy.polpermissive, policy.polcmd,
                       pg_get_expr(policy.polqual, policy.polrelid),
                       pg_get_expr(policy.polwithcheck, policy.polrelid),
                       COALESCE(
                           NULLIF((
                               SELECT string_agg(quote_ident(role.rolname), ', ')
                               FROM pg_roles AS role
                               WHERE role.oid = ANY(policy.polroles)
                           ), ''),
                           'PUBLIC'
                       )
                FROM pg_depend AS dependency
                JOIN pg_policy AS policy ON policy.oid = dependency.objid
                JOIN pg_class AS policy_table ON policy_table.oid = policy.polrelid
                JOIN pg_namespace AS policy_namespace ON policy_namespace.oid = policy_table.relnamespace
                JOIN pg_class AS target_table ON target_table.oid = dependency.refobjid
                JOIN pg_namespace AS target_namespace ON target_namespace.oid = target_table.relnamespace
                WHERE dependency.classid = 'pg_policy'::regclass
                  AND dependency.refclassid = 'pg_class'::regclass
                  AND target_namespace.nspname = current_schema()
                  AND target_table.relname = ANY(%s)
                """,
                [list(conflicting_targets)],
            )
            policies = [row for row in cursor.fetchall() if row[1] not in conflicting_targets]
            for schema, table, policy_name, *_ in policies:
                cursor.execute(
                    f"DROP POLICY {quote_name(policy_name)} "
                    f"ON {quote_name(schema)}.{quote_name(table)}"
                )
            for table_name in LEGACY_TARGET_DROP_ORDER:
                if table_name not in conflicting_targets:
                    continue
                cursor.execute(f"DROP TABLE {quote_name(table_name)}")

    for model_name, source_table, target_table in TABLE_RENAMES:
        model = apps.get_model("institutes", model_name)
        if source_table in existing:
            schema_editor.alter_db_table(model, source_table, target_table)

    if foreign_keys or policies:
        with connection.cursor() as cursor:
            for schema, table, constraint_name, definition in foreign_keys:
                cursor.execute(
                    f"ALTER TABLE {quote_name(schema)}.{quote_name(table)} "
                    f"ADD CONSTRAINT {quote_name(constraint_name)} {definition}"
                )
            command_names = {
                "*": "ALL",
                "r": "SELECT",
                "a": "INSERT",
                "w": "UPDATE",
                "d": "DELETE",
            }
            for schema, table, policy_name, permissive, command, using, with_check, roles in policies:
                definition = (
                    f"CREATE POLICY {quote_name(policy_name)} "
                    f"ON {quote_name(schema)}.{quote_name(table)} "
                    f"AS {'PERMISSIVE' if permissive else 'RESTRICTIVE'} "
                    f"FOR {command_names[command]} TO {roles}"
                )
                if using:
                    definition += f" USING ({using})"
                if with_check:
                    definition += f" WITH CHECK ({with_check})"
                cursor.execute(definition)


class Migration(migrations.Migration):
    dependencies = [("institutes", "0011_repair_missing_institute_columns")]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(rename_to_unprefixed_tables, migrations.RunPython.noop)
            ],
            state_operations=[
                migrations.AlterModelTable(name="institute", table="institutes"),
                migrations.AlterModelTable(name="branch", table="branches"),
                migrations.AlterModelTable(name="institutedocument", table="institute_documents"),
                migrations.AlterModelTable(name="subscriptionplan", table="subscription_plans"),
                migrations.AlterModelTable(name="institutesubscription", table="institute_subscriptions"),
                migrations.AlterModelTable(name="instituteconsentrecord", table="institute_consent_records"),
                migrations.AlterModelTable(name="institutemembership", table="institute_memberships"),
            ],
        ),
    ]
