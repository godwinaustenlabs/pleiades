-- Remote seed: HR Report data using actual employee IDs from remote DB
-- Employees: Saad Naik, Arham Zahid, Hashir Rauf, Maaz Bin Asif, Muhammad Ali Aamir, Muhammad Subhan Zia, Zaid Burhan

PRAGMA foreign_keys = OFF;

-- ── ATTENDANCE ──
INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_saad_0710', 'emp_3dda152e0b8bcbce60d446c4edaa2ebf', '2026-07-10', '09:00', '17:00', 'Present', 8.0, strftime('%s', 'now'));
INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_saad_0711', 'emp_3dda152e0b8bcbce60d446c4edaa2ebf', '2026-07-11', '09:15', '17:30', 'Present', 8.25, strftime('%s', 'now'));
INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_saad_0714', 'emp_3dda152e0b8bcbce60d446c4edaa2ebf', '2026-07-14', '10:00', '18:00', 'Late', 8.0, strftime('%s', 'now'));

INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_arham_0710', 'emp_5609fc2a315ae3621b2071279a769d33', '2026-07-10', '09:00', '17:00', 'Present', 8.0, strftime('%s', 'now'));
INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_arham_0711', 'emp_5609fc2a315ae3621b2071279a769d33', '2026-07-11', '09:00', '17:00', 'Present', 8.0, strftime('%s', 'now'));
INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_arham_0714', 'emp_5609fc2a315ae3621b2071279a769d33', '2026-07-14', NULL, NULL, 'Absent', 0.0, strftime('%s', 'now'));

INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_hashir_0710', 'emp_d1b8e9072e4506de46181b86f3663835', '2026-07-10', '08:45', '17:00', 'Present', 8.25, strftime('%s', 'now'));
INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_hashir_0711', 'emp_d1b8e9072e4506de46181b86f3663835', '2026-07-11', '09:00', '18:00', 'Present', 9.0, strftime('%s', 'now'));
INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_hashir_0714', 'emp_d1b8e9072e4506de46181b86f3663835', '2026-07-14', '09:00', '17:00', 'Present', 8.0, strftime('%s', 'now'));

INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_maaz_0710', 'emp_d22aa63bd993a1611f1323c2f8083601', '2026-07-10', '09:00', '17:00', 'Present', 8.0, strftime('%s', 'now'));
INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_maaz_0711', 'emp_d22aa63bd993a1611f1323c2f8083601', '2026-07-11', '09:00', '17:00', 'Present', 8.0, strftime('%s', 'now'));

INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_ali_0710', 'emp_6b629ff7ebf2887efa5f5ca0054b88d9', '2026-07-10', '09:30', '18:00', 'Late', 8.5, strftime('%s', 'now'));
INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_ali_0711', 'emp_6b629ff7ebf2887efa5f5ca0054b88d9', '2026-07-11', '09:00', '17:00', 'Present', 8.0, strftime('%s', 'now'));

INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_subhan_0710', 'emp_8f76b423b567a73a68d5233a3aee3d27', '2026-07-10', '09:00', '17:00', 'Present', 8.0, strftime('%s', 'now'));
INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_subhan_0714', 'emp_8f76b423b567a73a68d5233a3aee3d27', '2026-07-14', '09:00', '19:00', 'Present', 10.0, strftime('%s', 'now'));

INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_zaid_0710', 'emp_6c19d0771b43a174042c9f0ac41e4b78', '2026-07-10', '09:00', '17:00', 'Present', 8.0, strftime('%s', 'now'));
INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at)
VALUES ('att_zaid_0711', 'emp_6c19d0771b43a174042c9f0ac41e4b78', '2026-07-11', NULL, NULL, 'Absent', 0.0, strftime('%s', 'now'));

-- ── LEAVE REQUESTS ──
INSERT OR IGNORE INTO leave_requests (id, employee_id, leave_type, start_date, end_date, status, reason, created_at)
VALUES ('lr_saad_01', 'emp_3dda152e0b8bcbce60d446c4edaa2ebf', 'Annual', '2026-07-01', '2026-07-03', 'Approved', 'Personal errands', strftime('%s', 'now'));
INSERT OR IGNORE INTO leave_requests (id, employee_id, leave_type, start_date, end_date, status, reason, created_at)
VALUES ('lr_arham_01', 'emp_5609fc2a315ae3621b2071279a769d33', 'Sick', '2026-07-05', '2026-07-06', 'Approved', 'Flu', strftime('%s', 'now'));
INSERT OR IGNORE INTO leave_requests (id, employee_id, leave_type, start_date, end_date, status, reason, created_at)
VALUES ('lr_hashir_01', 'emp_d1b8e9072e4506de46181b86f3663835', 'Casual', '2026-06-28', '2026-06-28', 'Approved', 'Family event', strftime('%s', 'now'));
INSERT OR IGNORE INTO leave_requests (id, employee_id, leave_type, start_date, end_date, status, reason, created_at)
VALUES ('lr_maaz_01', 'emp_d22aa63bd993a1611f1323c2f8083601', 'Annual', '2026-08-01', '2026-08-07', 'Pending', 'Summer vacation', strftime('%s', 'now'));
INSERT OR IGNORE INTO leave_requests (id, employee_id, leave_type, start_date, end_date, status, reason, created_at)
VALUES ('lr_ali_01', 'emp_6b629ff7ebf2887efa5f5ca0054b88d9', 'Sick', '2026-07-08', '2026-07-08', 'Approved', 'Medical appointment', strftime('%s', 'now'));
INSERT OR IGNORE INTO leave_requests (id, employee_id, leave_type, start_date, end_date, status, reason, created_at)
VALUES ('lr_zaid_01', 'emp_6c19d0771b43a174042c9f0ac41e4b78', 'Annual', '2026-06-15', '2026-06-19', 'Rejected', 'Project deadline conflict', strftime('%s', 'now'));

-- ── PAYROLL RECORDS ──
INSERT OR IGNORE INTO payroll_records (payroll_id, payroll_month, gross_salary, withholding_tax, other_deductions, bonuses, net_pay, raise_amount, disbursement_status, payment_date, finance_reference, employee_id, allowances_breakdown, deductions_breakdown, created_at)
VALUES ('pay_saad_2606', '2026-06', 120000.0, 12000.0, 3000.0, 5000.0, 110000.0, 0.0, 'paid', '2026-06-30', 'TXN-GA-001', 'emp_3dda152e0b8bcbce60d446c4edaa2ebf', '[]', '[]', strftime('%s', 'now'));
INSERT OR IGNORE INTO payroll_records (payroll_id, payroll_month, gross_salary, withholding_tax, other_deductions, bonuses, net_pay, raise_amount, disbursement_status, payment_date, finance_reference, employee_id, allowances_breakdown, deductions_breakdown, created_at)
VALUES ('pay_arham_2606', '2026-06', 90000.0, 9000.0, 2000.0, 3000.0, 82000.0, 0.0, 'paid', '2026-06-30', 'TXN-GA-002', 'emp_5609fc2a315ae3621b2071279a769d33', '[]', '[]', strftime('%s', 'now'));
INSERT OR IGNORE INTO payroll_records (payroll_id, payroll_month, gross_salary, withholding_tax, other_deductions, bonuses, net_pay, raise_amount, disbursement_status, payment_date, finance_reference, employee_id, allowances_breakdown, deductions_breakdown, created_at)
VALUES ('pay_hashir_2606', '2026-06', 85000.0, 8500.0, 2000.0, 0.0, 74500.0, 0.0, 'paid', '2026-06-30', 'TXN-GA-003', 'emp_d1b8e9072e4506de46181b86f3663835', '[]', '[]', strftime('%s', 'now'));
INSERT OR IGNORE INTO payroll_records (payroll_id, payroll_month, gross_salary, withholding_tax, other_deductions, bonuses, net_pay, raise_amount, disbursement_status, payment_date, finance_reference, employee_id, allowances_breakdown, deductions_breakdown, created_at)
VALUES ('pay_maaz_2606', '2026-06', 80000.0, 8000.0, 1500.0, 2000.0, 72500.0, 0.0, 'paid', '2026-06-30', 'TXN-GA-004', 'emp_d22aa63bd993a1611f1323c2f8083601', '[]', '[]', strftime('%s', 'now'));
INSERT OR IGNORE INTO payroll_records (payroll_id, payroll_month, gross_salary, withholding_tax, other_deductions, bonuses, net_pay, raise_amount, disbursement_status, payment_date, finance_reference, employee_id, allowances_breakdown, deductions_breakdown, created_at)
VALUES ('pay_ali_2606', '2026-06', 95000.0, 9500.0, 2500.0, 0.0, 83000.0, 0.0, 'paid', '2026-06-30', 'TXN-GA-005', 'emp_6b629ff7ebf2887efa5f5ca0054b88d9', '[]', '[]', strftime('%s', 'now'));
INSERT OR IGNORE INTO payroll_records (payroll_id, payroll_month, gross_salary, withholding_tax, other_deductions, bonuses, net_pay, raise_amount, disbursement_status, payment_date, finance_reference, employee_id, allowances_breakdown, deductions_breakdown, created_at)
VALUES ('pay_subhan_2606', '2026-06', 75000.0, 7500.0, 1500.0, 1000.0, 67000.0, 0.0, 'paid', '2026-06-30', 'TXN-GA-006', 'emp_8f76b423b567a73a68d5233a3aee3d27', '[]', '[]', strftime('%s', 'now'));
INSERT OR IGNORE INTO payroll_records (payroll_id, payroll_month, gross_salary, withholding_tax, other_deductions, bonuses, net_pay, raise_amount, disbursement_status, payment_date, finance_reference, employee_id, allowances_breakdown, deductions_breakdown, created_at)
VALUES ('pay_zaid_2606', '2026-06', 70000.0, 7000.0, 1500.0, 0.0, 61500.0, 0.0, 'paid', '2026-06-30', 'TXN-GA-007', 'emp_6c19d0771b43a174042c9f0ac41e4b78', '[]', '[]', strftime('%s', 'now'));

-- July payroll pending
INSERT OR IGNORE INTO payroll_records (payroll_id, payroll_month, gross_salary, withholding_tax, other_deductions, bonuses, net_pay, raise_amount, disbursement_status, employee_id, allowances_breakdown, deductions_breakdown, created_at)
VALUES ('pay_saad_2607', '2026-07', 120000.0, 12000.0, 3000.0, 0.0, 105000.0, 0.0, 'pending', 'emp_3dda152e0b8bcbce60d446c4edaa2ebf', '[]', '[]', strftime('%s', 'now'));
INSERT OR IGNORE INTO payroll_records (payroll_id, payroll_month, gross_salary, withholding_tax, other_deductions, bonuses, net_pay, raise_amount, disbursement_status, employee_id, allowances_breakdown, deductions_breakdown, created_at)
VALUES ('pay_arham_2607', '2026-07', 90000.0, 9000.0, 2000.0, 0.0, 79000.0, 0.0, 'pending', 'emp_5609fc2a315ae3621b2071279a769d33', '[]', '[]', strftime('%s', 'now'));

-- ── ASSETS ──
INSERT OR IGNORE INTO assets (id, asset_name, asset_type, assigned_to, issue_date, condition, status, created_at)
VALUES ('ast_saad_01', 'MacBook Pro 16"', 'Laptop', 'emp_3dda152e0b8bcbce60d446c4edaa2ebf', '2025-01-15', 'Good', 'Assigned', strftime('%s', 'now'));
INSERT OR IGNORE INTO assets (id, asset_name, asset_type, assigned_to, issue_date, condition, status, created_at)
VALUES ('ast_saad_02', 'LG UltraWide Monitor', 'Monitor', 'emp_3dda152e0b8bcbce60d446c4edaa2ebf', '2025-01-15', 'Good', 'Assigned', strftime('%s', 'now'));
INSERT OR IGNORE INTO assets (id, asset_name, asset_type, assigned_to, issue_date, condition, status, created_at)
VALUES ('ast_arham_01', 'MacBook Air 15"', 'Laptop', 'emp_5609fc2a315ae3621b2071279a769d33', '2025-02-10', 'Good', 'Assigned', strftime('%s', 'now'));
INSERT OR IGNORE INTO assets (id, asset_name, asset_type, assigned_to, issue_date, condition, status, created_at)
VALUES ('ast_hashir_01', 'Dell Latitude 5540', 'Laptop', 'emp_d1b8e9072e4506de46181b86f3663835', '2025-03-01', 'Good', 'Assigned', strftime('%s', 'now'));
INSERT OR IGNORE INTO assets (id, asset_name, asset_type, assigned_to, issue_date, condition, status, created_at)
VALUES ('ast_maaz_01', 'HP EliteBook 840', 'Laptop', 'emp_d22aa63bd993a1611f1323c2f8083601', '2025-03-15', 'Good', 'Assigned', strftime('%s', 'now'));
INSERT OR IGNORE INTO assets (id, asset_name, asset_type, assigned_to, issue_date, condition, status, created_at)
VALUES ('ast_ali_01', 'Lenovo ThinkPad X1', 'Laptop', 'emp_6b629ff7ebf2887efa5f5ca0054b88d9', '2025-04-01', 'Good', 'Assigned', strftime('%s', 'now'));
INSERT OR IGNORE INTO assets (id, asset_name, asset_type, assigned_to, issue_date, condition, status, created_at)
VALUES ('ast_subhan_01', 'Dell XPS 15', 'Laptop', 'emp_8f76b423b567a73a68d5233a3aee3d27', '2025-04-15', 'Good', 'Assigned', strftime('%s', 'now'));
INSERT OR IGNORE INTO assets (id, asset_name, asset_type, assigned_to, issue_date, condition, status, created_at)
VALUES ('ast_zaid_01', 'Asus ROG Zephyrus', 'Laptop', 'emp_6c19d0771b43a174042c9f0ac41e4b78', '2025-05-01', 'Good', 'Assigned', strftime('%s', 'now'));
INSERT OR IGNORE INTO assets (id, asset_name, asset_type, assigned_to, issue_date, condition, status, created_at)
VALUES ('ast_unassigned_01', 'Logitech MX Master 3', 'Mouse', NULL, '2025-01-01', 'New', 'Available', strftime('%s', 'now'));
INSERT OR IGNORE INTO assets (id, asset_name, asset_type, assigned_to, issue_date, condition, status, created_at)
VALUES ('ast_unassigned_02', 'Samsung 27" Monitor', 'Monitor', NULL, '2025-01-01', 'Good', 'Available', strftime('%s', 'now'));

PRAGMA foreign_keys = ON;
-- ✅ Remote seed complete
