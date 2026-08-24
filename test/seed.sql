-- Per-user permission fixture. One row per (user, app, feature) — the same
-- shape production carries since migration 0025 removed roles.
--
-- Order matters: user_app_permissions.user_id is a foreign key into
-- users_logins, so the accounts are inserted before their grants.


-- Truncate in dependency order: grants reference users_logins.
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
