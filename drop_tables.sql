
 ⛅️ wrangler 4.80.0 (update available 4.94.0)
─────────────────────────────────────────────
Resource location: remote 

🌀 Executing on remote database ganova-db (db780139-3f18-42d4-878c-1daa1c0cb4be):
🌀 To execute on your local development database, remove the --remote flag from your wrangler command.
🚣 Executed 2 commands in 0.25ms
[
  {
    "results": [],
    "success": true,
    "meta": {
      "served_by": "v3-prod",
      "served_by_region": "EEUR",
      "served_by_colo": "MXP",
      "served_by_primary": true,
      "timings": {
        "sql_duration_ms": 0.0896
      },
      "duration": 0.0896,
      "changes": 0,
      "last_row_id": 0,
      "changed_db": false,
      "size_after": 561152,
      "rows_read": 0,
      "rows_written": 0,
      "total_attempts": 1
    }
  },
  {
    "results": [
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS _cf_KV;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS d1_migrations;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS audit_logs;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS permissions;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS role_permissions;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS users_logins;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS clients;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS committee_members;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS committees;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS core_docs;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS employee_lab;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS employees;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS labs;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS monthly_reports;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS legal_tracker;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS payroll_records;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS sectors;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS accounts;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS channels;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS fund_requests;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS invoices;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS pl_reports;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS transactions;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS active_agreements;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS agreement_parties;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS compliance_obligations;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS intellectual_property;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS legal_requests;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS legal_sops;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS legal_templates;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS parties_stakeholders;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS deployments;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS environments;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS epics;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS issues;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS projects;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS releases;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS stories;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS acq_tasks;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS campaigns;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS contacts_leads;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS content_calendar;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS funnels_pipelines;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS leads_activity;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS sprints;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS password_reset_tokens;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS role_hierarchy;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS user_ownership;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS user_app_access;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS client_logins;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS crm_documents;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS crm_planner_events;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS crm_tickets;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS user_dashboard_state;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS user_notes;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS user_app_permissions;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS crm_ticket_notes;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS task_attachments;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS user_notifications;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS app_messages;"
      },
      {
        "'DROP TABLE IF EXISTS ' || name || ';'": "DROP TABLE IF EXISTS universal_tasks;"
      }
    ],
    "success": true,
    "meta": {
      "served_by": "v3-prod",
      "served_by_region": "EEUR",
      "served_by_colo": "MXP",
      "served_by_primary": true,
      "timings": {
        "sql_duration_ms": 0.1629
      },
      "duration": 0.1629,
      "changes": 0,
      "last_row_id": 0,
      "changed_db": false,
      "size_after": 561152,
      "rows_read": 125,
      "rows_written": 0,
      "total_attempts": 1
    }
  }
]
