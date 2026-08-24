-- Role-based fixture. Grants mirror migration 0020, which copies each role's
-- rows verbatim from its representative production user.
DELETE FROM role_app_permissions; DELETE FROM users_logins; DELETE FROM roles;
INSERT INTO roles (id,name,created_at) VALUES ('role_ceo','CEO',0);
INSERT INTO roles (id,name,created_at) VALUES ('role_tech_lead','Tech Lead',0);
INSERT INTO roles (id,name,created_at) VALUES ('role_marketing_lead','Marketing Lead',0);
INSERT INTO roles (id,name,created_at) VALUES ('role_crm_member','CRM Member',0);
INSERT INTO roles (id,name,created_at) VALUES ('role_none','No Access',0);
-- Holds nothing but the `tasks` feature of four modules. Before those routers
-- were gated per feature, requireAppAccess let this role read and write every
-- agreement, project, campaign and lab in them.
INSERT INTO roles (id,name,created_at) VALUES ('role_tasks_only','Tasks Only',0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_hr_employees','role_ceo','hr','employees',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_hr_appointments','role_ceo','hr','appointments',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_hr_payroll','role_ceo','hr','payroll',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_hr_resets','role_ceo','hr','resets',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_hr_tasks','role_ceo','hr','tasks',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_finance_transactions','role_ceo','finance','transactions',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_finance_invoices','role_ceo','finance','invoices',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_finance_fund_requests','role_ceo','finance','fund_requests',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_finance_accounts','role_ceo','finance','accounts',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_finance_tasks','role_ceo','finance','tasks',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_legal_agreements','role_ceo','legal','agreements',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_legal_templates','role_ceo','legal','templates',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_legal_compliance','role_ceo','legal','compliance',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_legal_ip','role_ceo','legal','ip',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_legal_tasks','role_ceo','legal','tasks',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_tech_projects','role_ceo','tech','projects',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_tech_issues','role_ceo','tech','issues',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_tech_deployments','role_ceo','tech','deployments',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_tech_tasks','role_ceo','tech','tasks',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_acquisition_campaigns','role_ceo','acquisition','campaigns',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_acquisition_contacts','role_ceo','acquisition','contacts',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_acquisition_content','role_ceo','acquisition','content',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_acquisition_sprints','role_ceo','acquisition','sprints',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_acquisition_tasks','role_ceo','acquisition','tasks',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_ops_labs','role_ceo','ops','labs',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_ops_committees','role_ceo','ops','committees',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_ops_clients','role_ceo','ops','clients',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_ops_docs','role_ceo','ops','docs',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_ops_tasks','role_ceo','ops','tasks',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_crm_tickets','role_ceo','crm','tickets',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_crm_documents','role_ceo','crm','documents',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_crm_planner','role_ceo','crm','planner',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_crm_tasks','role_ceo','crm','tasks',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_dashboard_overview','role_ceo','dashboard','overview',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_dashboard_notes','role_ceo','dashboard','notes',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_dashboard_tasks','role_ceo','dashboard','tasks',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_core_employees','role_ceo','core','employees',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_core_labs','role_ceo','core','labs',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_core_clients','role_ceo','core','clients',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_core_committees','role_ceo','core','committees',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_core_docs','role_ceo','core','docs',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_admin_roles','role_ceo','admin','roles',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_admin_permissions','role_ceo','admin','permissions',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_admin_users','role_ceo','admin','users',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_admin_api_keys','role_ceo','admin','api_keys',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_admin_audit_logs','role_ceo','admin','audit_logs',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_ceo_admin_resets','role_ceo','admin','resets',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_dashboard_overview','role_tech_lead','dashboard','overview',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_dashboard_notes','role_tech_lead','dashboard','notes',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_dashboard_tasks','role_tech_lead','dashboard','tasks',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_tech_projects','role_tech_lead','tech','projects',1,1,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_tech_issues','role_tech_lead','tech','issues',1,1,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_tech_deployments','role_tech_lead','tech','deployments',1,1,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_tech_tasks','role_tech_lead','tech','tasks',1,1,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_crm_tickets','role_tech_lead','crm','tickets',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_crm_documents','role_tech_lead','crm','documents',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_crm_planner','role_tech_lead','crm','planner',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_crm_tasks','role_tech_lead','crm','tasks',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_core_employees','role_tech_lead','core','employees',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_core_labs','role_tech_lead','core','labs',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_core_clients','role_tech_lead','core','clients',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_core_committees','role_tech_lead','core','committees',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tech_lead_core_docs','role_tech_lead','core','docs',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_dashboard_overview','role_marketing_lead','dashboard','overview',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_dashboard_notes','role_marketing_lead','dashboard','notes',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_dashboard_tasks','role_marketing_lead','dashboard','tasks',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_acquisition_campaigns','role_marketing_lead','acquisition','campaigns',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_acquisition_contacts','role_marketing_lead','acquisition','contacts',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_acquisition_content','role_marketing_lead','acquisition','content',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_acquisition_sprints','role_marketing_lead','acquisition','sprints',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_acquisition_tasks','role_marketing_lead','acquisition','tasks',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_crm_tickets','role_marketing_lead','crm','tickets',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_crm_documents','role_marketing_lead','crm','documents',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_crm_planner','role_marketing_lead','crm','planner',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_crm_tasks','role_marketing_lead','crm','tasks',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_core_employees','role_marketing_lead','core','employees',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_core_labs','role_marketing_lead','core','labs',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_core_clients','role_marketing_lead','core','clients',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_core_committees','role_marketing_lead','core','committees',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_marketing_lead_core_docs','role_marketing_lead','core','docs',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_crm_member_crm_tickets','role_crm_member','crm','tickets',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_crm_member_crm_documents','role_crm_member','crm','documents',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_crm_member_crm_planner','role_crm_member','crm','planner',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_crm_member_crm_tasks','role_crm_member','crm','tasks',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_crm_member_dashboard_overview','role_crm_member','dashboard','overview',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_crm_member_dashboard_notes','role_crm_member','dashboard','notes',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_crm_member_dashboard_tasks','role_crm_member','dashboard','tasks',1,1,1,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_crm_member_core_employees','role_crm_member','core','employees',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_crm_member_core_labs','role_crm_member','core','labs',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_crm_member_core_clients','role_crm_member','core','clients',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_crm_member_core_committees','role_crm_member','core','committees',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_crm_member_core_docs','role_crm_member','core','docs',1,0,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tasks_only_legal_tasks','role_tasks_only','legal','tasks',1,1,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tasks_only_tech_tasks','role_tasks_only','tech','tasks',1,1,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tasks_only_acquisition_tasks','role_tasks_only','acquisition','tasks',1,1,0,0,0);
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('rap_role_tasks_only_ops_tasks','role_tasks_only','ops','tasks',1,1,0,0,0);
INSERT INTO users_logins (id,email,username,name,password_hash,role_id,is_active,is_superadmin,created_at,failed_attempts) VALUES ('u_ceo','u_ceo@test.local','u_ceo','u_ceo','x','role_ceo',1,1,0,0);
INSERT INTO users_logins (id,email,username,name,password_hash,role_id,is_active,is_superadmin,created_at,failed_attempts) VALUES ('u_tech','u_tech@test.local','u_tech','u_tech','x','role_tech_lead',1,0,0,0);
INSERT INTO users_logins (id,email,username,name,password_hash,role_id,is_active,is_superadmin,created_at,failed_attempts) VALUES ('u_mkt','u_mkt@test.local','u_mkt','u_mkt','x','role_marketing_lead',1,0,0,0);
INSERT INTO users_logins (id,email,username,name,password_hash,role_id,is_active,is_superadmin,created_at,failed_attempts) VALUES ('u_crm','u_crm@test.local','u_crm','u_crm','x','role_crm_member',1,0,0,0);
INSERT INTO users_logins (id,email,username,name,password_hash,role_id,is_active,is_superadmin,created_at,failed_attempts) VALUES ('u_none','u_none@test.local','u_none','u_none','x','role_none',1,0,0,0);
INSERT INTO users_logins (id,email,username,name,password_hash,role_id,is_active,is_superadmin,created_at,failed_attempts) VALUES ('u_tasks','u_tasks@test.local','u_tasks','u_tasks','x','role_tasks_only',1,0,0,0);
-- Tasks used to prove that an unscoped GET /api/tasks no longer returns
-- every task in the company to any authenticated caller.
INSERT INTO universal_tasks (task_id,title,status,department,board_position,created_at,updated_at)
	VALUES ('task_tech','Tech task','todo','Tech',0,0,0);
INSERT INTO universal_tasks (task_id,title,status,department,board_position,created_at,updated_at)
	VALUES ('task_hr','HR task','todo','HR',0,0,0);
INSERT INTO universal_tasks (task_id,title,status,department,board_position,created_at,updated_at)
	VALUES ('task_crm','CRM task','todo','CRM',0,0,0);
-- finance/docs grant, mirroring migration 0022 (copies the role's finance level).
INSERT INTO role_app_permissions (id,role_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at)
	VALUES ('rap_role_ceo_finance_docs','role_ceo','finance','docs',1,1,1,0,0);

-- One document per department, to prove the finance endpoint is scoped and does
-- not leak HR's documents (they share the company_documents table).
INSERT INTO company_documents (id,title,document_type,url,department,created_at)
	VALUES ('doc_fin','FY26 Statements','Statement','/api/assets/download/finance-docs/fy26.pdf','finance',0);
INSERT INTO company_documents (id,title,document_type,url,department,created_at)
	VALUES ('doc_hr','Employee Handbook','SOP','/api/assets/download/company-docs/handbook.pdf','hr',0);
-- An employee carrying sensitive fields, used to prove the directory strips them
-- for callers who cannot administer employee records.
INSERT INTO employees (employee_id,name,department,employment_status,created_at,updated_at,cnic,bank_details,tax_information,base_salary,address)
	VALUES ('emp_pii','Sensitive Person','Finance','active',0,0,'3520112345678','{"bankName":"HBL","accountNumber":"12345678901234"}','{"ntn":"1234567-8"}',250000,'12 Test Road, Lahore');
