-- Per-user permission fixture. One row per (user, app, feature) — the same
-- shape production carries since migration 0025 removed roles.
--
-- Order matters: user_app_permissions.user_id is a foreign key into
-- users_logins, so the accounts are inserted before their grants.


-- Truncate in dependency order: grants reference users_logins.
DELETE FROM calc_config;
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

-- Pleiades rate config, identical to migration 0027, so tests assert against
-- the same rows production carries.
INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_company_tax_rates', 'company_tax_rates', '2026-07-01', NULL,
	'{"standard_company_pct":29,"small_company_pct":20,"small_company_turnover_ceiling_pkr":250000000,"pseb_it_export_final_tax_pct":0.25,"pseb_section":"154A","exemption_alternative":{"section":"65F","condition":"80% of export proceeds through banking channel"},"note":"IT export income is normally the governing rate for this company"}',
	'verified', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');
INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_minimum_tax', 'minimum_tax', '2026-07-01', NULL,
	'{"section":"113","rate_pct_of_turnover":1.25,"applies_even_on_loss":true,"turnover_threshold_pkr":100000000,"threshold_confidence":"approximate \u2014 spec says \"~Rs 100M historically\"; confirm against the current Finance Act"}',
	'needs_verification', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');
INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_advance_tax_schedule', 'advance_tax_schedule', '2026-07-01', NULL,
	'{"section":"147","quarterly_due_dates":["09-15","12-15","03-15","06-15"]}',
	'verified', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');
INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_salary_withholding_slabs', 'salary_withholding_slabs', '2026-07-01', NULL,
	'{"section":"149","slabs":[],"known_endpoints":{"zero_rate_up_to_pkr":600000,"top_marginal_rate_pct":35,"top_bracket_starts_above_pkr":7000000},"blocking":true,"why_blocking":"The spec gives only the endpoints, not the intermediate brackets. Seeding invented brackets would be exactly the failure the spec forbids (\"numbers come from tools, not from you\"), so calc_salary_withholding must refuse until the full Finance Act slab table is entered here.","deposit_and_statement_due":"15th of the following month"}',
	'needs_verification', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');
INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_vendor_withholding', 'vendor_withholding', '2026-07-01', NULL,
	'{"section":"153","filer_rate_range_pct":[4,15],"non_filer_rate_range_pct":[8,30],"rate_depends_on":"service/goods type \u2014 per-type table not given in the spec","de_minimis_pkr":{"services_per_year":30000,"goods_per_year":75000},"blocking":true,"why_blocking":"Only ranges are known. A range cannot produce a figure; the per-service-type table must be entered before calc_vendor_withholding can return a number.","filer_status_source":"check ATL / accounts software before applying the lower rate"}',
	'needs_verification', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');
INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_eobi_contribution', 'eobi_contribution', '2026-07-01', NULL,
	'{"mandatory_at_employee_count":5,"employer_pct":5,"employee_pct":1,"base":"government-notified minimum wage, NOT actual salary","notified_minimum_wage_pkr":null,"blocking":true,"why_blocking":"The percentages are known but the notified minimum wage they apply to is not in the spec and is revised periodically. Enter the current notified wage to unblock.","deposit_due":"15th of the following month"}',
	'needs_verification', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');
INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_pessi_sessi_contribution', 'pessi_sessi_contribution', '2026-07-01', NULL,
	'{"scope":"provincial \u2014 PESSI (Punjab) / SESSI (Sindh), selected by registered office","rate_pct":null,"threshold":null,"blocking":true,"why_blocking":"The spec states these were not confirmed against a primary source. Section B requires this calculator to return confidence:\"unverified\"; it must not present a figure as settled.","required_output_flag":"verify against current provincial notification"}',
	'unverified', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');
INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_wwf', 'wwf', '2026-07-01', NULL,
	'{"rate_pct_of_total_income":2,"income_threshold_pkr":500000,"assessed_with":"annual return"}',
	'verified', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');
INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_wppf', 'wppf', '2026-07-01', NULL,
	'{"rate_pct":5,"base":"audited profit before the WPPF deduction itself"}',
	'verified', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');
INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_sales_tax', 'sales_tax', '2026-07-01', NULL,
	'{"federal_goods":"generally not applicable to a pure services company","provincial_services":{"authorities":["SRB","PRA","KPRA"],"rate_pct":null,"pseb_export_exemption":"applies to qualifying IT export income"},"blocking":true,"why_blocking":"Provincial services-tax rates are not given in the spec and vary by province."}',
	'needs_verification', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');
INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_secp_deadlines', 'secp_deadlines', '2026-07-01', NULL,
	'{"annual_return_form_a_days_after_agm":30,"form_29_days_after_officer_change":14,"ubo_update_days_after_fy_end":14,"audit_required_above_paid_up_capital_pkr":1000000,"audit_threshold_confidence":"approximate \u2014 spec says \"~Rs 1M, confirm current SECP figure\"","below_threshold":"unaudited accounts with director affidavit"}',
	'needs_verification', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');
INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_filing_deadlines', 'filing_deadlines', '2026-07-01', NULL,
	'{"company_income_tax_return":"31 December following a 30 June year-end","nil_return_required":true,"director_wealth_statement":{"section":"116","due":"30 September"},"salary_withholding_statement":"15th of the following month","eobi_deposit":"15th of the following month"}',
	'verified', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');
