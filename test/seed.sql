-- Per-user permission fixture. One row per (user, app, feature) — the same
-- shape production carries since migration 0025 removed roles.
--
-- Order matters: user_app_permissions.user_id is a foreign key into
-- users_logins, so the accounts are inserted before their grants.


-- Truncate in dependency order: grants reference users_logins.
DELETE FROM compliance_config;
DELETE FROM user_app_permissions;
DELETE FROM users_logins;

INSERT INTO users_logins (id,email,username,name,password_hash,is_active,is_superadmin,created_at,failed_attempts) VALUES ('u_ceo','u_ceo@test.local','u_ceo','u_ceo','x',1,1,0,0);
INSERT INTO users_logins (id,email,username,name,password_hash,is_active,is_superadmin,created_at,failed_attempts) VALUES ('u_tech','u_tech@test.local','u_tech','u_tech','x',1,0,0,0);
INSERT INTO users_logins (id,email,username,name,password_hash,is_active,is_superadmin,created_at,failed_attempts) VALUES ('u_mkt','u_mkt@test.local','u_mkt','u_mkt','x',1,0,0,0);
INSERT INTO users_logins (id,email,username,name,password_hash,is_active,is_superadmin,created_at,failed_attempts) VALUES ('u_crm','u_crm@test.local','u_crm','u_crm','x',1,0,0,0);
INSERT INTO users_logins (id,email,username,name,password_hash,is_active,is_superadmin,created_at,failed_attempts) VALUES ('u_none','u_none@test.local','u_none','u_none','x',1,0,0,0);
INSERT INTO users_logins (id,email,username,name,password_hash,is_active,is_superadmin,created_at,failed_attempts) VALUES ('u_tasks','u_tasks@test.local','u_tasks','u_tasks','x',1,0,0,0);

-- u_tasks holds nothing but the `tasks` feature of four modules. Before those
-- routers were gated per feature, app-level access let that grant alone read and
-- write every agreement, project, campaign and lab in them.
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_hr_employees','u_ceo','hr','employees',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_hr_appointments','u_ceo','hr','appointments',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_hr_payroll','u_ceo','hr','payroll',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_hr_resets','u_ceo','hr','resets',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_hr_tasks','u_ceo','hr','tasks',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_finance_transactions','u_ceo','finance','transactions',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_finance_invoices','u_ceo','finance','invoices',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_finance_fund_requests','u_ceo','finance','fund_requests',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_finance_accounts','u_ceo','finance','accounts',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_finance_tasks','u_ceo','finance','tasks',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_legal_agreements','u_ceo','legal','agreements',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_legal_templates','u_ceo','legal','templates',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_legal_compliance','u_ceo','legal','compliance',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_legal_ip','u_ceo','legal','ip',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_legal_tasks','u_ceo','legal','tasks',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_tech_projects','u_ceo','tech','projects',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_tech_issues','u_ceo','tech','issues',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_tech_deployments','u_ceo','tech','deployments',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_tech_tasks','u_ceo','tech','tasks',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_acquisition_campaigns','u_ceo','acquisition','campaigns',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_acquisition_contacts','u_ceo','acquisition','contacts',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_acquisition_content','u_ceo','acquisition','content',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_acquisition_sprints','u_ceo','acquisition','sprints',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_acquisition_tasks','u_ceo','acquisition','tasks',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_ops_labs','u_ceo','ops','labs',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_ops_committees','u_ceo','ops','committees',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_ops_clients','u_ceo','ops','clients',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_ops_docs','u_ceo','ops','docs',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_ops_tasks','u_ceo','ops','tasks',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_crm_tickets','u_ceo','crm','tickets',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_crm_documents','u_ceo','crm','documents',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_crm_planner','u_ceo','crm','planner',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_crm_tasks','u_ceo','crm','tasks',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_dashboard_overview','u_ceo','dashboard','overview',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_dashboard_notes','u_ceo','dashboard','notes',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_dashboard_tasks','u_ceo','dashboard','tasks',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_core_employees','u_ceo','core','employees',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_core_labs','u_ceo','core','labs',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_core_clients','u_ceo','core','clients',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_core_committees','u_ceo','core','committees',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_core_docs','u_ceo','core','docs',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_admin_permissions','u_ceo','admin','permissions',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_admin_users','u_ceo','admin','users',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_admin_api_keys','u_ceo','admin','api_keys',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_admin_audit_logs','u_ceo','admin','audit_logs',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_admin_resets','u_ceo','admin','resets',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_dashboard_overview','u_tech','dashboard','overview',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_dashboard_notes','u_tech','dashboard','notes',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_dashboard_tasks','u_tech','dashboard','tasks',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_tech_projects','u_tech','tech','projects',1,1,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_tech_issues','u_tech','tech','issues',1,1,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_tech_deployments','u_tech','tech','deployments',1,1,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_tech_tasks','u_tech','tech','tasks',1,1,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_crm_tickets','u_tech','crm','tickets',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_crm_documents','u_tech','crm','documents',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_crm_planner','u_tech','crm','planner',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_crm_tasks','u_tech','crm','tasks',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_core_employees','u_tech','core','employees',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_core_labs','u_tech','core','labs',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_core_clients','u_tech','core','clients',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_core_committees','u_tech','core','committees',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tech_core_docs','u_tech','core','docs',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_dashboard_overview','u_mkt','dashboard','overview',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_dashboard_notes','u_mkt','dashboard','notes',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_dashboard_tasks','u_mkt','dashboard','tasks',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_acquisition_campaigns','u_mkt','acquisition','campaigns',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_acquisition_contacts','u_mkt','acquisition','contacts',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_acquisition_content','u_mkt','acquisition','content',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_acquisition_sprints','u_mkt','acquisition','sprints',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_acquisition_tasks','u_mkt','acquisition','tasks',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_crm_tickets','u_mkt','crm','tickets',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_crm_documents','u_mkt','crm','documents',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_crm_planner','u_mkt','crm','planner',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_crm_tasks','u_mkt','crm','tasks',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_core_employees','u_mkt','core','employees',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_core_labs','u_mkt','core','labs',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_core_clients','u_mkt','core','clients',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_core_committees','u_mkt','core','committees',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_mkt_core_docs','u_mkt','core','docs',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_crm_crm_tickets','u_crm','crm','tickets',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_crm_crm_documents','u_crm','crm','documents',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_crm_crm_planner','u_crm','crm','planner',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_crm_crm_tasks','u_crm','crm','tasks',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_crm_dashboard_overview','u_crm','dashboard','overview',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_crm_dashboard_notes','u_crm','dashboard','notes',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_crm_dashboard_tasks','u_crm','dashboard','tasks',1,1,1,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_crm_core_employees','u_crm','core','employees',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_crm_core_labs','u_crm','core','labs',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_crm_core_clients','u_crm','core','clients',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_crm_core_committees','u_crm','core','committees',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_crm_core_docs','u_crm','core','docs',1,0,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tasks_legal_tasks','u_tasks','legal','tasks',1,1,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tasks_tech_tasks','u_tasks','tech','tasks',1,1,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tasks_acquisition_tasks','u_tasks','acquisition','tasks',1,1,0,0,0);
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_tasks_ops_tasks','u_tasks','ops','tasks',1,1,0,0,0);
-- finance/docs grant, mirroring migration 0022 (copies the role's finance level).
INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES ('uap_u_ceo_finance_docs','u_ceo','finance','docs',1,1,1,0,0);

-- Per-user permission fixture. One row per (user, app, feature) — the same
-- shape production carries since migration 0025 removed roles.
-- Tasks used to prove that an unscoped GET /api/tasks no longer returns
-- every task in the company to any authenticated caller.
INSERT INTO universal_tasks (task_id,title,status,department,board_position,created_at,updated_at)
	VALUES ('task_tech','Tech task','todo','Tech',0,0,0);
INSERT INTO universal_tasks (task_id,title,status,department,board_position,created_at,updated_at)
	VALUES ('task_hr','HR task','todo','HR',0,0,0);
INSERT INTO universal_tasks (task_id,title,status,department,board_position,created_at,updated_at)
	VALUES ('task_crm','CRM task','todo','CRM',0,0,0);
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

-- Compliance configuration, identical to migration 0028, so tests assert
-- against the same variables production carries.
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_legal_name', 'company_legal_name', 'company', 'Legal name', 'As registered with SECP.', 'text', NULL, NULL, 1, 0, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_secp_reg_no', 'company_secp_reg_no', 'company', 'SECP registration number', NULL, 'text', NULL, NULL, 1, 1, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_ntn', 'company_ntn', 'company', 'NTN', 'FBR National Tax Number.', 'text', NULL, NULL, 1, 2, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_sales_tax_reg', 'company_sales_tax_reg', 'company', 'Sales tax registration', 'Leave blank if not registered.', 'text', NULL, NULL, 0, 3, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_province', 'company_province', 'company', 'Registered province', 'Decides PESSI vs SESSI, and which provincial revenue authority applies.', 'text', NULL, NULL, 1, 4, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_pseb_status', 'company_pseb_status', 'company', 'PSEB registration status', 'Drives the IT-export tax treatment.', 'text', NULL, NULL, 1, 5, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_accountant_name', 'accountant_name', 'company', 'Accountant of record', 'The person who reviews and files every draft.', 'text', NULL, NULL, 1, 6, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_accountant_email', 'accountant_email', 'company', 'Accountant email', NULL, 'text', NULL, NULL, 1, 7, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_operator_email', 'operator_email', 'company', 'Operator email', 'Where deliverable notifications are sent.', 'text', NULL, NULL, 1, 8, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_slack_channel', 'slack_channel', 'company', 'Slack channel', 'Channel or webhook target for notifications.', 'text', NULL, NULL, 0, 9, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_tax_year_start', 'tax_year_start', 'tax_year', 'Tax year starts', 'Month and day the tax year opens.', 'date', 'MM-DD', '07-01', 1, 10, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_tax_year_end', 'tax_year_end', 'tax_year', 'Tax year ends', 'Month and day the tax year closes.', 'date', 'MM-DD', '06-30', 1, 11, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_current_tax_year_label', 'current_tax_year_label', 'tax_year', 'Current tax year label', 'How filings for the current year are labelled, e.g. TY2027.', 'text', NULL, 'TY2027', 1, 12, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_tax_standard_pct', 'company_tax_standard_pct', 'income_tax', 'Standard company rate', 'Applies when no concessionary regime does.', 'percent', '%', '29', 1, 13, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_tax_small_pct', 'company_tax_small_pct', 'income_tax', 'Small company rate', NULL, 'percent', '%', '20', 0, 14, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_small_company_turnover_ceiling', 'small_company_turnover_ceiling', 'income_tax', 'Small company turnover ceiling', 'Above this the small-company rate does not apply.', 'currency', 'PKR', '250000000', 0, 15, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_pseb_export_final_tax_pct', 'pseb_export_final_tax_pct', 'income_tax', 'IT export final tax (s154A)', 'Normally the governing rate for export revenue.', 'percent', '%', '0.25', 1, 16, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_section_65f_exemption', 'section_65f_exemption', 'income_tax', 'Section 65F exemption applies', 'Full exemption instead of the final tax, subject to the banking-channel condition.', 'boolean', NULL, 'false', 0, 17, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_section_65f_banking_pct', 'section_65f_banking_pct', 'income_tax', 'Section 65F banking-channel condition', 'Share of export proceeds that must arrive through banking channels.', 'percent', '%', '80', 0, 18, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_minimum_tax_pct', 'minimum_tax_pct', 'minimum_tax', 'Minimum tax rate', 'Of turnover, payable even on a loss (s113).', 'percent', '%', '1.25', 1, 19, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_minimum_tax_threshold', 'minimum_tax_threshold', 'minimum_tax', 'Minimum tax turnover threshold', 'Confirm against the current Finance Act.', 'currency', 'PKR', NULL, 1, 20, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_advance_tax_due_dates', 'advance_tax_due_dates', 'advance_tax', 'Quarterly due dates', 'Section 147 instalment dates, as MM-DD.', 'json', NULL, '["09-15","12-15","03-15","06-15"]', 1, 21, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_salary_withholding_slabs', 'salary_withholding_slabs', 'salary_withholding', 'Salary tax slabs', 'The full progressive slab table (s149). Every bracket must be entered; the agent will not interpolate.', 'json', NULL, NULL, 1, 22, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_salary_wht_deposit_day', 'salary_wht_deposit_day', 'salary_withholding', 'Deposit and statement day', 'Day of the following month the deposit and statement are due.', 'number', NULL, '15', 1, 23, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_vendor_withholding_rates', 'vendor_withholding_rates', 'vendor_withholding', 'Withholding rates by payment type', 'Filer and non-filer rate per service or goods type (s153).', 'json', NULL, NULL, 1, 24, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_vendor_de_minimis_services', 'vendor_de_minimis_services', 'vendor_withholding', 'De minimis — services', 'No withholding below this annual total to one payee.', 'currency', 'PKR', '30000', 0, 25, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_vendor_de_minimis_goods', 'vendor_de_minimis_goods', 'vendor_withholding', 'De minimis — goods', NULL, 'currency', 'PKR', '75000', 0, 26, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_eobi_min_employees', 'eobi_min_employees', 'eobi', 'Mandatory at employee count', NULL, 'number', NULL, '5', 1, 27, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_eobi_employer_pct', 'eobi_employer_pct', 'eobi', 'Employer contribution', 'Of the notified minimum wage, not actual salary.', 'percent', '%', '5', 1, 28, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_eobi_employee_pct', 'eobi_employee_pct', 'eobi', 'Employee contribution', NULL, 'percent', '%', '1', 1, 29, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_eobi_notified_min_wage', 'eobi_notified_min_wage', 'eobi', 'Notified minimum wage', 'The wage base contributions are calculated on. Revised periodically.', 'currency', 'PKR', NULL, 1, 30, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_eobi_deposit_day', 'eobi_deposit_day', 'eobi', 'Deposit day', 'Day of the following month.', 'number', NULL, '15', 1, 31, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_pessi_sessi_authority', 'pessi_sessi_authority', 'pessi_sessi', 'Institution', 'PESSI (Punjab) or SESSI (Sindh), by registered office.', 'text', NULL, NULL, 1, 32, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_pessi_sessi_rate_pct', 'pessi_sessi_rate_pct', 'pessi_sessi', 'Contribution rate', 'Verify against the current provincial notification.', 'percent', '%', NULL, 1, 33, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_pessi_sessi_wage_ceiling', 'pessi_sessi_wage_ceiling', 'pessi_sessi', 'Wage ceiling', 'The wage cap contributions are assessed on, if any.', 'currency', 'PKR', NULL, 0, 34, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_wwf_pct', 'wwf_pct', 'wwf_wppf', 'WWF rate', 'Of total income.', 'percent', '%', '2', 1, 35, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_wwf_income_threshold', 'wwf_income_threshold', 'wwf_wppf', 'WWF income threshold', 'WWF applies once income reaches this.', 'currency', 'PKR', '500000', 1, 36, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_wppf_pct', 'wppf_pct', 'wwf_wppf', 'WPPF rate', 'Of audited profit before the WPPF deduction itself.', 'percent', '%', '5', 1, 37, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_sales_tax_authority', 'sales_tax_authority', 'sales_tax', 'Provincial authority', 'SRB, PRA, KPRA or none.', 'text', NULL, NULL, 1, 38, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_sales_tax_services_pct', 'sales_tax_services_pct', 'sales_tax', 'Services sales tax rate', NULL, 'percent', '%', NULL, 1, 39, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_sales_tax_export_exempt', 'sales_tax_export_exempt', 'sales_tax', 'IT export exemption applies', NULL, 'boolean', NULL, 'true', 0, 40, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_secp_form_a_days', 'secp_form_a_days', 'secp', 'Form A deadline', 'Days after AGM or member resolution.', 'number', 'days', '30', 1, 41, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_secp_form_29_days', 'secp_form_29_days', 'secp', 'Form 29 deadline', 'Days after any director or officer change.', 'number', 'days', '14', 1, 42, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_secp_ubo_days', 'secp_ubo_days', 'secp', 'UBO update deadline', 'Days after financial year end.', 'number', 'days', '14', 1, 43, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_secp_audit_threshold', 'secp_audit_threshold', 'secp', 'Audit required above paid-up capital', 'Below this, unaudited accounts with a director affidavit. Confirm the current SECP figure.', 'currency', 'PKR', NULL, 1, 44, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_return_due_date', 'return_due_date', 'filing_deadlines', 'Company return due', 'Date the annual return is due, as MM-DD.', 'date', 'MM-DD', '12-31', 1, 45, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_wealth_statement_due', 'wealth_statement_due', 'filing_deadlines', 'Director wealth statement due', 'Section 116, separate from the company return.', 'date', 'MM-DD', '09-30', 1, 46, '2026-07-01', unixepoch(), unixepoch());
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_nil_return_required', 'nil_return_required', 'filing_deadlines', 'Nil return still required', 'Generate the filing even when there is nothing to report.', 'boolean', NULL, 'true', 1, 47, '2026-07-01', unixepoch(), unixepoch());

-- Migration 0036: the daily runner's operator. Left unset here as it is in
-- production, so the tests exercise the refusal path by default.
INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_daily_runner_actor', 'daily_runner_actor', 'company', 'Daily runner operator', 'The users_logins id the twice-daily check runs as. Its tool calls are limited to that person''s permissions. Leave blank to switch the scheduled run off.', 'text', NULL, NULL, 0, 90, '2020-01-01', unixepoch(), unixepoch());
