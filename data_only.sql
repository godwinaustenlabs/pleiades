PRAGMA defer_foreign_keys=TRUE;
	`id` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`owner_name` text NOT NULL,
	`role_id` text NOT NULL,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`details` text,
	`timestamp` integer NOT NULL
);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_5f2fef2ad465325ac5555e84eb8612d2','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778429083);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ac4107085be514a5ec6170b7cd58c79f','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778429089);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_4469a7715529d4cb6582c6f6855f5c5f','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778429198);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_96fbac03061d322d5f62baab51c87211','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778429212);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_90c5e1fdae4bc7d5c0bbb7360e8c6cb7','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778429221);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_358cce9b94002aefe5f9fb12299a790c','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778432938);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_2e7097e8896be2f0d43b73cb19771550','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778432995);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_371e2b14f97f8d83e7453e54321e6aa9','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778433342);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_63fd8fb78779d91d48f0acad5087d91a','user_ceo-001','UPDATE','users_logins','user_ceo-001','{"profile_updated":["name","username","passwordHash","passwordUpdatedAt"]}',1778433365);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d2def0f595f9b6a54ed1acc96bee1fc7','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778433407);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_6352bbdfce3a6fffc9d115b6c0b219c9','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778433417);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_9705d7fe72693a4ef69389933696b964','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778433449);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a3afc0cdf1da71f312e9649e033597f0','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778433474);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_9a63f06a64fa4810db55fd3431090e25','user_ceo-001','CREATE','employees','emp_00f513bd8ef31c96943063384ac61e6b','{"employmentStatus":"active","department":"Tech","name":"Hashit","role":"Dir"}',1778433637);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_e8547d8816a8c1387f7cd665e24041a5','user_ceo-001','CREATE','committees','com_acc3a08e162d78ad1bf8ffba27eb9b03','{"committeeName":"Test","opsStatus":"active"}',1778434432);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_302b1c9dc454d2a3b773dc1baf11afe2','user_ceo-001','CREATE','committees','com_f0c518a47a21bc66736afacb903ab934','{"committeeName":"test 2"}',1778434447);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_4e6e99e2fdb1119ef939275fe61f50ec','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778474020);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_4d589ed23750afe9b8f3faa790abfed7','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778474261);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c3b901311d85dac93dae9aa5fd300cec','user_ceo-001','DELETE','employees','emp_00f513bd8ef31c96943063384ac61e6b',NULL,1778474418);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_444b1cc5b57f1f0bd76129556fbb87c5','user_ceo-001','DELETE','employees','emp_00f513bd8ef31c96943063384ac61e6b',NULL,1778474432);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_bc636e48e8003f71023d5acd71d130ac','user_ceo-001','DELETE','employees','emp_00f513bd8ef31c96943063384ac61e6b',NULL,1778474620);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b49c8134c07a43fad69d83d948354a44','user_ceo-001','DELETE','employees','emp_00f513bd8ef31c96943063384ac61e6b',NULL,1778474662);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_055397c76d96f57936f05a07927b7bae','user_ceo-001','DELETE','employees','emp_00f513bd8ef31c96943063384ac61e6b',NULL,1778474689);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_7cf8e03149f85863c296fe85feb2779e','user_ceo-001','CREATE','employees','emp_8a08a4a1b7b31f76a6b336056b977b97','{"name":"Saad Naik","role":"saf"}',1778474704);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_dafef2e58f8089171e4c08f12fcd74e8','user_ceo-001','DELETE','employees','emp_8a08a4a1b7b31f76a6b336056b977b97',NULL,1778474710);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c68c7d633be70712d1f84b9b06ea16e2','user_ceo-001','CREATE','employees','emp_3dda152e0b8bcbce60d446c4edaa2ebf','{"name":"Saad Naik","department":"","role":"CEO","employmentStatus":"active","hireDate":"2022-01-01","efficiencyScore":"1","profilePhoto":"https://files.godwinausten.org/01803C13-46AF-4AD8-8185-0E7ECEF64D1B.jpeg"}',1778475070);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_73c460ff5459f71ea02ab31b860a8210','user_ceo-001','DELETE','committees','com_acc3a08e162d78ad1bf8ffba27eb9b03',NULL,1778478100);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_dc8c00ccb332436ec9e07977bc44d3f2','user_ceo-001','DELETE','committees','com_f0c518a47a21bc66736afacb903ab934',NULL,1778478103);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_144c39f9c6ee0a5c7af95afa3d95a88e','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778478250);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ff6af6e3afe63321d633de35af5d6aa1','user_ceo-001','DELETE','committees','com_acc3a08e162d78ad1bf8ffba27eb9b03',NULL,1778478256);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_6320224d3355a7c9bd6bdbd602bad173','user_ceo-001','UPDATE','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org","note":"re-provisioned"}',1778479023);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_3bae68c953950f07f7cac9505d6daf34','user_ceo-001','UPDATE','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org","note":"re-provisioned"}',1778479647);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_f41b1d5aeed64a81a722991f3f3efbfb','user_ceo-001','CREATE','appointments','appt_24277bea69cc94cb3fb7905410dde285','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user_ceo-001"}',1778479647);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_70df058dc8acd4febbdaa191d47b4b49','user_ceo-001','UPDATE','user_app_access','acc_ceo_hr','{"appName":"hr","accessLevel":"admin"}',1778479647);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a3ffa53ffbf433c6f658cad4fcedb9d4','user_ceo-001','UPDATE','user_app_access','acc_ceo_finance','{"appName":"finance","accessLevel":"employee"}',1778479647);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_89724b52b0eaf49a7fda64f3ba65d8a2','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778483871);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_8ac1647717492dc8ed494d60af41833c','user_ceo-001','CREATE','committees','com_a06558ea8e626dce855a856ce47b2e1e','{"committeeName":"Test","opsStatus":"active"}',1778484194);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_68e95a2bcc20327694d9e7f7516f0c91','user_ceo-001','CREATE','committees','com_b025354c012e17d5c823c311c989a7e1','{"committeeName":"Faayy","type":"Client","opsStatus":"active","purpose":"To serve Faayy Shop","activeStatus":"true"}',1778486215);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_60b930a1b8f95edf82d0c84b46bfd747','user_ceo-001','CREATE','clients','client_105a7426d5313a9e84f32d69b4c20ab4','{"clientName":"Faayy Shop","primaryContact":"Farha Iram","contactEmail":"info@faayy.shop","phone":"+92004458194","industry":"Art","onboardingDate":"2026-03-01","contractStatus":"active"}',1778486262);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_cb9867293018cec9148b1eb2d19d1dee','user_ceo-001','CREATE','labs','lab_20ca62803e40284a851bc6500cd818d3','{"labName":"Tech Lab","category":"Internal Lab","status":"active","opsLeadId":"emp_8a08a4a1b7b31f76a6b336056b977b97"}',1778486292);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_f0b556d29299008c4c0c8c72d5d811c0','user_ceo-001','DELETE','committees','com_b025354c012e17d5c823c311c989a7e1',NULL,1778486311);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_dec33b098b20bb3a5f4daceb0817b58d','user_ceo-001','CREATE','committees','com_8e0906e8a6821498911b9df724fd4f4f','{"committeeName":"Faayy Shop","type":"","opsStatus":"active","activeStatus":"true","labId":"lab_20ca62803e40284a851bc6500cd818d3","clientId":"client_105a7426d5313a9e84f32d69b4c20ab4"}',1778486352);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_6e5ab012a463a9ad2632bdf5c015fecd','user_ceo-001','CREATE','crm_provision','com_8e0906e8a6821498911b9df724fd4f4f','{"employeeIds":["emp_3dda152e0b8bcbce60d446c4edaa2ebf"]}',1778486380);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a7cdde44b11279bd1082e64a45b8728d','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778488680);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_07fde7eb1880cf0c353154eeb0bf8017','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org"}',1778488713);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0032c00e7820e91b106c1d5c846e3ca4','user_ceo-001','UPDATE','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org","note":"re-provisioned"}',1778488782);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c2661225da10891ba32744695e626ab3','user_ceo-001','UPDATE','appointments','appt_24277bea69cc94cb3fb7905410dde285','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user_ceo-001","committeeId":null,"roleOrTitle":"CEO","appointmentDate":"2026-05-11","termType":"permanent","isActive":true}',1778488782);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ebc35bea2d2de3e1c43cf830f4797faa','user_ceo-001','CREATE','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik@godwinausten.org"}',1778488861);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_8bcff78d77a17d607a2ad92937db1386','user_ceo-001','CREATE','appointments','appt_a3036e95884bee31f9e8bd06174c959f','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"usr_95fbbea2c6df18c4cb8b7dfaf540089c"}',1778488861);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_821abc1a83fcd80fb717a02254b46804','user_ceo-001','DELETE','committees','com_8e0906e8a6821498911b9df724fd4f4f',NULL,1778488888);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0cfcef9355c9f8310f81b61c1fbea496','user_ceo-001','UPDATE','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org","note":"re-provisioned"}',1778493898);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_6e197b4984b525f18a1247dbc1d26fcb','user_ceo-001','UPDATE','appointments','emp_3dda152e0b8bcbce60d446c4edaa2ebf','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user_ceo-001","committeeId":null,"roleOrTitle":"CEO","appointmentDate":"2026-05-11","termType":"permanent","isActive":true}',1778493898);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_544eaf3fd313efd40e644cd9de56f0a7','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo"}',1778493960);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_234ffb5ee479bc3fe663db4b2701980c','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo"}',1778493996);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_215238d191846f2e9b777e580601f1a1','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1778494012);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1d780954d7f0ced3879b1f99f7098497','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo"}',1778494515);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_6fc02c7a5139dd6133082bc2c9c950a3','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1778498890);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_87e267ccc7d5c079cbf64cb2987d0379','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo"}',1778499157);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1c9d520c30e37a95bb3eaae745568728','user_ceo-001','CREATE','committees','com_4760192638b3b729601a9d626caf80e6','{"committeeName":"Faayy Shop","opsStatus":"active","activeStatus":"true","labId":"lab_20ca62803e40284a851bc6500cd818d3","clientId":"client_105a7426d5313a9e84f32d69b4c20ab4"}',1778499276);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0dbc170d1678514ffc6621e535879ca4','user_ceo-001','CREATE','crm_provision','com_4760192638b3b729601a9d626caf80e6','{"employeeIds":["emp_3dda152e0b8bcbce60d446c4edaa2ebf"]}',1778499299);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_f8116819d0f205cfb36a8c3befe59371','user_ceo-001','UPDATE','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org","note":"re-provisioned"}',1778499370);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c7ba809d8345ec37ac92961dfa45806e','user_ceo-001','CREATE','appointments','appt_47da2aac45485f9ae7a713b6d91ae3af','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user_ceo-001"}',1778499371);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_8b110d8e517ddcc6c2179c39f365cc96','user_ceo-001','UPDATE','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org","note":"re-provisioned"}',1778499378);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b9fe38892d30b0888bc0a55743c3c0ba','user_ceo-001','CREATE','appointments','appt_99dada1854e2806bacb98f71980a9877','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user_ceo-001"}',1778499378);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a5fb52d397919cccab6165ddcb51344e','user_ceo-001','UPDATE','users_logins','user_ceo-001','{"email":"ceo@godwinausten.org","note":"re-provisioned"}',1778499413);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a7b5fd947d19e24e44ca1dc6c04d15fa','user_ceo-001','UPDATE','appointments','emp_3dda152e0b8bcbce60d446c4edaa2ebf','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user_ceo-001","committeeId":null,"roleOrTitle":"CEO","appointmentDate":"2026-05-11","termType":"permanent","isActive":true}',1778499414);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_fdd3e0637d8af75682cc0393133ef4c0','user_ceo-001','UPDATE','users_logins','user_ceo-001','{"email":"","note":"re-provisioned"}',1778499439);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1e5b3b0e5b727596bdbf4a1c29545dec','user_ceo-001','UPDATE','appointments','appt_99dada1854e2806bacb98f71980a9877','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user_ceo-001","committeeId":null,"roleOrTitle":"CEO","appointmentDate":"2026-05-11","termType":"permanent","isActive":true}',1778499439);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_42776532f20dac380b99dce71aaa064a','user_ceo-001','UPDATE','users_logins','user_ceo-001','{"email":"","note":"re-provisioned"}',1778499494);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_05da0a4b7d5887789b2ee547d41e1691','user_ceo-001','UPDATE','appointments','appt_47da2aac45485f9ae7a713b6d91ae3af','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user_ceo-001","committeeId":null,"roleOrTitle":"CEO","appointmentDate":"2026-05-11","termType":"permanent","isActive":true}',1778499494);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1a18fa82403ec3b99000418f01755c98','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo"}',1778499517);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a8fd1545bab69559b25c7246cdd63e74','user_ceo-001','DELETE','appointments','appt_47da2aac45485f9ae7a713b6d91ae3af',NULL,1778499584);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_8d02bfe10a964371eac20ed971065144','user_ceo-001','UPDATE','users_logins','user_ceo-001','{"email":"","note":"re-provisioned"}',1778499600);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1490f3a047938e0df7e61b81ea931481','user_ceo-001','UPDATE','appointments','appt_99dada1854e2806bacb98f71980a9877','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user_ceo-001","committeeId":null,"roleOrTitle":"CEO","appointmentDate":"2026-05-11","termType":"permanent","isActive":true}',1778499600);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d1566fdb78cd8298a3fea19d98291233','user_ceo-001','UPDATE','users_logins','user_ceo-001','{"email":"","note":"re-provisioned"}',1778499624);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d43b3f7d90325a55c3edaa067846ba82','user_ceo-001','UPDATE','appointments','appt_99dada1854e2806bacb98f71980a9877','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user_ceo-001","committeeId":null,"roleOrTitle":"CEO","appointmentDate":"2026-05-11","termType":"permanent","isActive":true}',1778499625);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_fa187f225dadefa582088bda9faa22eb','user_ceo-001','UPDATE','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik@godwinausten.org","note":"re-provisioned"}',1778499700);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_954e7d00aeb5dd11c04d85be6ed0e162','user_ceo-001','CREATE','appointments','appt_24fbd2610f293bb526a269012fc99807','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"usr_95fbbea2c6df18c4cb8b7dfaf540089c"}',1778499700);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_013936446db64785c6f4b8bd22a9123e','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1778499827);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_66501ac7daeb0b472b63daa9af120cf5','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1778499855);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_873c3af7a4018755e1b9fb43da8fca7a','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo"}',1778499905);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ecb9c5a79b3ecff868fcda9d08468ed5','user_ceo-001','CREATE','employees','emp_a7cccd4fa4082b0e0b1ba8d1a8539b0a','{"name":"Hashir","department":"Tech","employmentStatus":"active"}',1778499923);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_5bbd8493eb3f1cf97f2c716ee891f81c','user_ceo-001','CREATE','users_logins','usr_9b72d0b17220fa994e1ccb93d05413bc','{"email":"hashirrauf@godwinausten.org"}',1778500074);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_532e2bc993541a1cf90c6739a43c6782','user_ceo-001','CREATE','appointments','appt_6eab8a7f0c1a677c11344273e9066415','{"employeeId":"emp_a7cccd4fa4082b0e0b1ba8d1a8539b0a","accountId":"usr_9b72d0b17220fa994e1ccb93d05413bc"}',1778500075);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_2a7f58471c179d510e97b6a5d7866194','usr_9b72d0b17220fa994e1ccb93d05413bc','LOGIN','users_logins','usr_9b72d0b17220fa994e1ccb93d05413bc','{"email":"hashirrauf"}',1778500088);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_77139aec6ce8e0765dd228a368e9110d','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1778500110);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d204352f93d985a15637203aaced3005','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo"}',1778500118);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_6f4db3f5473cfa6f692c947bacda832b','usr_9b72d0b17220fa994e1ccb93d05413bc','LOGIN','users_logins','usr_9b72d0b17220fa994e1ccb93d05413bc','{"email":"hashirrauf"}',1778500125);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_9260bb37e86dc32e908287053563f965','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo"}',1778500397);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1270e3356c8464092adc9ef81037c497','user_ceo-001','CREATE','active_agreements','agmt_2245a21bd29bc74b112cc514ba861f63','{"agreementName":"MSA","contractType":"MSA","autoRenewal":"true","status":"active","committeeId":"com_4760192638b3b729601a9d626caf80e6","clientId":"client_105a7426d5313a9e84f32d69b4c20ab4"}',1778500634);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_6fe6fdc373a03f564eb1e01507bc7856','user_ceo-001','LOGIN','users_logins','user_ceo-001','{"email":"ceo"}',1778508575);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_5cc77a785d78733dc5fface7aac29e58','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1778508620);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_3b62ca63cb65d6304743096d4eaa7ae8','user_hr-001','LOGIN','users_logins','user_hr-001','{"email":"hr@godwinausten.org"}',1778508872);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_adb01a11408aad4f23c9e6eb2f136eef','user-ceo-new','LOGIN','users_logins','user-ceo-new','{"email":"ceo@godwinausten.org"}',1778509895);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_4540275e932d4ac0e664c9f4c81b572c','user-ceo-new','UPDATE','users_logins','user-ceo-new','{"email":"ceo@godwinausten.org","note":"re-provisioned"}',1778510023);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b676e0ffb772986b851c894e2c8a0a9a','user-ceo-new','CREATE','appointments','appt_cbf26872ce07e5e483d0c24e182de6ec','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user-ceo-new"}',1778510023);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_2a8759e98659d9627c7f193aa38dedb6','user-ceo-new','LOGIN','users_logins','user-ceo-new','{"email":"ceo"}',1778510680);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_2efbc32361bb571e2fb990459eafe1c8','user-ceo-new','LOGIN','users_logins','user-ceo-new','{"email":"ceo"}',1778510917);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_783bcb392c36fea45ffbed6789e1541c','user-ceo-new','UPDATE','users_logins','user-ceo-new','{"email":"ceo@godwinausten.org","note":"re-provisioned"}',1778511000);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_749226bc5ce05c24ad79b7e25384b1b6','user-ceo-new','CREATE','appointments','appt_95b1682aca969e80e8c4fed07143ab45','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user-ceo-new"}',1778511000);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_f45547674357ab9c35ea37bc3abf2c88','user-ceo-new','UPDATE','users_logins','user-ceo-new','{"email":"ceo@godwinausten.org","note":"re-provisioned"}',1778511054);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_cbdc0f18e75177f1fc79fbfda6d22751','user-ceo-new','CREATE','appointments','appt_b668714d3b986d117ff9932caf9d626b','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user-ceo-new"}',1778511054);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0d806b9a4f6d091dc3aae636053f8b25','user-ceo-new','DELETE','appointments','appt_99dada1854e2806bacb98f71980a9877',NULL,1778511076);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_2556d2eb9d3294284f64f04d58a54936','user-ceo-new','DELETE','appointments','appt_95b1682aca969e80e8c4fed07143ab45',NULL,1778511081);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b7bb5f839b87acff32ba59db00da8901','user-ceo-new','DELETE','appointments','appt_b668714d3b986d117ff9932caf9d626b',NULL,1778511084);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_2df048f6a0f90b480347f56ab4ed0d29','user-ceo-new','UPDATE','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik@godwinausten.org","note":"re-provisioned"}',1778511156);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_52be7f82afea5f889378d0a8799e6bd8','user-ceo-new','UPDATE','appointments','appt_24fbd2610f293bb526a269012fc99807','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"usr_95fbbea2c6df18c4cb8b7dfaf540089c","committeeId":"com_4760192638b3b729601a9d626caf80e6","roleOrTitle":"PM Faayy Shop","appointmentDate":"2026-05-11","termType":"permanent","isActive":true}',1778511156);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_811c76875fc2c88d1f599590efdf9058','user-ceo-new','LOGIN','users_logins','user-ceo-new','{"email":"ceo"}',1778511191);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_e625804e452f1007cbbf918632a2c841','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1778511247);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_518845bca923874bd04354fcaa6a013d','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1778511325);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_24aa4aecd5ef7ab9fcce709b93c5d588','usr_9b72d0b17220fa994e1ccb93d05413bc','LOGIN','users_logins','usr_9b72d0b17220fa994e1ccb93d05413bc','{"email":"hashirrauf"}',1778511397);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_3134da9690985afcf980c26e02d77548','user-ceo-new','LOGIN','users_logins','user-ceo-new','{"email":"ceo"}',1778511434);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_177ef2ad3bcd437d66960477ca6097ce','user-ceo-new','UPDATE','users_logins','user-ceo-new','{"profile_updated":["name","username"]}',1778511457);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_852e08e73b0497796433b428a0311829','user-ceo-new','UPDATE','users_logins','user-ceo-new','{"profile_updated":["name","username"]}',1778511467);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_e2db5f10218909de8679d9f1255bf6de','user-ceo-new','LOGIN','users_logins','user-ceo-new','{"email":"ceo"}',1778511506);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a49526340bd824163de658d69eec9eae','user-ceo-new','CREATE','labs','lab_e47d9c3ba50cf3d0433c756d88232fdd','{"labName":"Acquisition Lab","status":"active"}',1778511536);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0c308ea1a2151fd076e98b67688c653e','user-ceo-new','CREATE','committees','com_afeb1eb343de16e1de5b3cf3e6433ef3','{"committeeName":"Tech Dept.","type":"Internal Department","opsStatus":"active","activeStatus":"true"}',1778511565);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_93abe4696af94a39769217e89256fdeb','user-ceo-new','CREATE','committees','com_f58071c82c4b30994121ace0eba2548c','{"committeeName":"Board of Directors","type":"Director Committee","opsStatus":"active","activeStatus":"true"}',1778511623);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_2adb549448515772d82916aabc011b00','user-ceo-new','LOGIN','users_logins','user-ceo-new','{"email":"ceo"}',1778511633);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ea59a8cb7ede9c3fb6564731cda6ab97','user-ceo-new','UPDATE','users_logins','usr_9b72d0b17220fa994e1ccb93d05413bc','{"email":"hashirrauf@godwinausten.org","note":"re-provisioned"}',1778511671);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b6a985f47b77db0c6c16c9f6924536fa','user-ceo-new','UPDATE','appointments','appt_6eab8a7f0c1a677c11344273e9066415','{"employeeId":"emp_a7cccd4fa4082b0e0b1ba8d1a8539b0a","accountId":"usr_9b72d0b17220fa994e1ccb93d05413bc","committeeId":"com_afeb1eb343de16e1de5b3cf3e6433ef3","roleOrTitle":"Director Tech Lab","appointmentDate":"2026-05-11","termType":"permanent","isActive":true}',1778511672);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_91f2a32f9d282b52af46f4237107ccfb','user-ceo-new','UPDATE','users_logins','usr_9b72d0b17220fa994e1ccb93d05413bc','{"email":"hashirrauf@godwinausten.org","note":"re-provisioned"}',1778511705);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c6352ea99d0ac26c6178c739764f3f36','user-ceo-new','UPDATE','appointments','appt_6eab8a7f0c1a677c11344273e9066415','{"employeeId":"emp_a7cccd4fa4082b0e0b1ba8d1a8539b0a","accountId":"usr_9b72d0b17220fa994e1ccb93d05413bc","committeeId":"com_afeb1eb343de16e1de5b3cf3e6433ef3","roleOrTitle":"Director Tech Lab","appointmentDate":"2026-05-11","termType":"permanent","isActive":true}',1778511705);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_5c820b13e8024d4e1b829aa590020802','user-ceo-new','UPDATE','users_logins','user-ceo-new','{"email":"ceo@godwinausten.org","note":"re-provisioned"}',1778511725);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0c779ae2b7f002a2a553ab12f8e61f31','user-ceo-new','UPDATE','appointments','appt_cbf26872ce07e5e483d0c24e182de6ec','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user-ceo-new","committeeId":"com_f58071c82c4b30994121ace0eba2548c","roleOrTitle":"CEO","appointmentDate":"2022-01-01","termType":"permanent","isActive":true}',1778511725);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c5cf61b4239119d9079eaab33c627b6e','user-ceo-new','UPDATE','users_logins','user-ceo-new','{"email":"ceo@godwinausten.org","note":"re-provisioned"}',1778511731);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_9a9cd99d5e4daa5599c1c47f7e6ae210','user-ceo-new','UPDATE','appointments','appt_cbf26872ce07e5e483d0c24e182de6ec','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user-ceo-new","committeeId":"com_f58071c82c4b30994121ace0eba2548c","roleOrTitle":"CEO","appointmentDate":"2022-01-01","termType":"permanent","isActive":true}',1778511731);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_8f4e2bb4c14421208602e0de5f544680','user-ceo-new','UPDATE','users_logins','user-ceo-new','{"email":"ceo@godwinausten.org","note":"re-provisioned"}',1778511738);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_338d7dc69605ddd6459448b1faae9f56','user-ceo-new','UPDATE','appointments','appt_cbf26872ce07e5e483d0c24e182de6ec','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user-ceo-new","committeeId":"com_f58071c82c4b30994121ace0eba2548c","roleOrTitle":"CEO","appointmentDate":"2022-01-01","termType":"permanent","isActive":true}',1778511738);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c1fc0eb0f50ea2712427cbab3bcd7385','user-ceo-new','UPDATE','users_logins','user-ceo-new','{"email":"ceo@godwinausten.org","note":"re-provisioned"}',1778511746);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_682bb4f83282c58ab2068bf24ea99ce1','user-ceo-new','UPDATE','appointments','appt_cbf26872ce07e5e483d0c24e182de6ec','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user-ceo-new","committeeId":"com_f58071c82c4b30994121ace0eba2548c","roleOrTitle":"CEO","appointmentDate":"2022-01-01","termType":"permanent","isActive":true}',1778511746);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c4bf238bcf6457bdafc8f58210c46391','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1778512169);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_4f387641d6a446740738b48d84aee71e','user-ceo-new','LOGIN','users_logins','user-ceo-new','{"email":"ceo"}',1778512217);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_41c761fe99b8ccdd5111621fe223025b','user-ceo-new','UPDATE','employees','emp_3dda152e0b8bcbce60d446c4edaa2ebf','{"name":"Saad Naik","slackId":null,"department":"HR,Finance,Tech,Legal,Ops","role":"CEO","employmentStatus":"active","hireDate":"2022-01-01","baseSalary":null,"efficiencyScore":1,"profilePhoto":"https://files.godwinausten.org/01803C13-46AF-4AD8-8185-0E7ECEF64D1B.jpeg","sectorId":null}',1778512248);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d8d9df95c68ba3c9de84c62c29bdf628','user-ceo-new','UPDATE','users_logins','user-ceo-new','{"email":"ceo@godwinausten.org","note":"re-provisioned"}',1778512288);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_85e381170ebf38e59f6689864a50c3f1','user-ceo-new','UPDATE','appointments','appt_cbf26872ce07e5e483d0c24e182de6ec','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"user-ceo-new","committeeId":"com_f58071c82c4b30994121ace0eba2548c","roleOrTitle":"CEO","appointmentDate":"2022-01-01","termType":"permanent","isActive":true}',1778512288);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0ee65380c16f1a7fdf54904e9ef29ec7','user-ceo-new','DELETE','universal_tasks','task_54bb2aecc14fbf6de1aebb9342358cba',NULL,1778514318);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_39fa64fdbdcf0b485eb7377e7e2bbb99','user-ceo-new','PROVISION','committee_members','com_4760192638b3b729601a9d626caf80e6','{"employeeIds":["emp_3dda152e0b8bcbce60d446c4edaa2ebf"]}',1778514418);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_e4ee9de37e3ec7dd41087dc672aaeb43','user-ceo-new','PROVISION','committee_members','com_afeb1eb343de16e1de5b3cf3e6433ef3','{"employeeIds":["emp_3dda152e0b8bcbce60d446c4edaa2ebf","emp_a7cccd4fa4082b0e0b1ba8d1a8539b0a"]}',1778514428);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_7a04fc62c5eaad69bd1ca6259a538495','user-ceo-new','PROVISION','committee_members','com_f58071c82c4b30994121ace0eba2548c','{"employeeIds":["emp_3dda152e0b8bcbce60d446c4edaa2ebf"]}',1778514435);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_de0f23de04ae80e6279612dd44709bcb','user-ceo-new','CREATE','client_logins','clog_10b48d762120a303025f1a7e0361b85d','{"clientId":"client_105a7426d5313a9e84f32d69b4c20ab4","email":"faayy@godwinausten.org"}',1778514709);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1e3bc55e1602f6edf69de72670d63ee1','user-ceo-new','DEPROVISION','committees','com_4760192638b3b729601a9d626caf80e6','{"action":"full_crm_cleanup"}',1778515904);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_06e3abfc6571de4a7ce1d8520dca69a7','user-ceo-new','DEPROVISION','committees','com_afeb1eb343de16e1de5b3cf3e6433ef3','{"action":"full_crm_cleanup"}',1778515909);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_18accb489fb5e9f3c81849db77e4bc2d','user-ceo-new','DEPROVISION','committees','com_f58071c82c4b30994121ace0eba2548c','{"action":"full_crm_cleanup"}',1778515913);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a5680df05ca4efca31552b9274689930','user-ceo-new','DEPROVISION','committees','com_4760192638b3b729601a9d626caf80e6','{"action":"full_crm_cleanup"}',1778515978);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1a4b898f8015f3f9e38fce4dcf8d10cf','user-ceo-new','PROVISION','committee_members','com_4760192638b3b729601a9d626caf80e6','{"employeeIds":["emp_3dda152e0b8bcbce60d446c4edaa2ebf"]}',1778515987);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_e4a6ec9d6e92eea78532c480f659fc40','user-ceo-new','CREATE','crm_ticket_notes','tkn_9a87fb5edd8196b49f06d65d9e9bbcbc','{"ticketId":"tkt_becb8a8e0d27724ebd2446e9f14e5912"}',1778516975);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_5da115db41956e641bfb1a1c5b21c586','user-ceo-new','UPDATE','crm_tickets','tkt_becb8a8e0d27724ebd2446e9f14e5912','{"status":"resolved"}',1778516981);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_6c0a8792740d1a5157c579175728a0df','user-ceo-new','CREATE','universal_tasks','task_88e7db9b85efe7ca73ab576e7ae253d8','{"title":"sfgsd","description":"","priority":"medium","status":"todo","assigneeId":null,"committeeId":null,"dueDate":null,"relatedEntityType":null,"relatedEntityId":null,"taskType":"operational","estimatedHours":0,"department":"Tech"}',1778518167);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_e4dcaa25428199bc046c7ae4fcfd07a6','user-ceo-new','CREATE','universal_tasks','task_a7aba5e86c611a71b10691b1460bd0b4','{"title":"jdjfd","description":"","priority":"medium","status":"todo","assigneeId":null,"committeeId":null,"dueDate":null,"taskType":"operational","estimatedHours":0,"relatedEntityType":null,"relatedEntityId":null,"department":"Tech"}',1778525820);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_894736296fa906ca4a39ca0b12bee36c','user-ceo-new','UPDATE','universal_tasks','task_a7aba5e86c611a71b10691b1460bd0b4','{"title":"jdjfd","description":"","priority":"medium","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"dueDate":null,"taskType":"operational","estimatedHours":0,"relatedEntityType":null,"relatedEntityId":null}',1778525831);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_40b012c7fe4d656db9cd18015917f4f3','user-ceo-new','CREATE','universal_tasks','task_dfba934c05eed50f3eb1d14b3af73170','{"title":"gefgsdfg","description":"","priority":"medium","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"dueDate":null,"taskType":"operational","estimatedHours":0,"department":"General"}',1778525906);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_74a9beda22c4bbbddaa9468cdd820981','user-ceo-new','CREATE','universal_tasks','task_79fd8cebcec6770912a4a64ed1d9e411','{"title":"adsffagafg","description":"","priority":"medium","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"dueDate":null,"taskType":"operational","estimatedHours":0,"department":"Finance"}',1778526329);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_dbcbafd5d3ca6af115e56e7eaa9fe96c','user-ceo-new','LOGIN','users_logins','user-ceo-new','{"email":"ceo"}',1778554385);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ecab5579a8015e6146fa6408528b853b','user-ceo-new','UPDATE','employees','emp_3dda152e0b8bcbce60d446c4edaa2ebf','{"name":"Saad Naik","slackId":"SL2751","department":"HR,Finance,Tech,Legal","role":"CEO","employmentStatus":"active","hireDate":"2022-01-01","baseSalary":200000,"efficiencyScore":90,"profilePhoto":null,"sectorId":null}',1778554442);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ba3bfad1893f1186046d7a96dcf76d25','user-ceo-new','LOGIN','users_logins','user-ceo-new','{"email":"ceo"}',1778554881);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_438fced5ba2c6079f650e629e59c4cca','user-ceo-new','UPDATE','universal_tasks','task_79fd8cebcec6770912a4a64ed1d9e411','{"title":"adsffagafg","description":"","priority":"medium","status":"completed","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"dueDate":"2026-05-20","taskType":"operational","estimatedHours":0}',1778554955);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_948671f8ea2bf23d42bc095607771651','user-ceo-new','UPDATE','universal_tasks','task_a7aba5e86c611a71b10691b1460bd0b4','{"title":"jdjfd","description":"","priority":"urgent","status":"in_progress","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"dueDate":null,"taskType":"operational","estimatedHours":0}',1778555083);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b704d76d833ca3c82c209089d37387a4','user-ceo-new','UPDATE','universal_tasks','task_a7aba5e86c611a71b10691b1460bd0b4','{"title":"jdjfd","description":"","priority":"urgent","status":"in_progress","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"dueDate":null,"taskType":"urgent","estimatedHours":0}',1778555091);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1dbb498c533203adbe821a7fc9b3c649','user-ceo-new','UPDATE','employees','emp_3dda152e0b8bcbce60d446c4edaa2ebf','{"name":"Saad Naik","slackId":"SL2751","department":"HR,Finance,Tech,Legal,Ops,Acquisition","role":"CEO","employmentStatus":"active","hireDate":"2022-01-01","baseSalary":200000,"efficiencyScore":90,"profilePhoto":null,"sectorId":null}',1778555231);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1af3104f071ced7b0ce74e3c83676711','user-ceo-new','UPDATE','employees','emp_a7cccd4fa4082b0e0b1ba8d1a8539b0a','{"name":"Hashir Rauf","slackId":null,"department":"Tech","role":null,"employmentStatus":"active","hireDate":null,"baseSalary":null,"efficiencyScore":null,"profilePhoto":null,"sectorId":null}',1778555266);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_659d8a01fc4b65a3b035ee7fae0a9289','user-ceo-new','CREATE','invoices','inv_95e382c5d6a9aa800b20d935ad902253','{"invoiceNumber":"356345","clientId":"client_105a7426d5313a9e84f32d69b4c20ab4","committeeId":"com_4760192638b3b729601a9d626caf80e6","amount":"3566","taxAmount":"356","issueDate":"2026-05-01","dueDate":"2026-05-28","status":"pending","invoiceDoc":"/api/assets/download/new_invoice/1778555793380_Red Modern Lettering Creative Studio Logo.png"}',1778555799);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_cc0c4ebd91a642c9553b9d4b375fb9f2','user-ceo-new','CREATE','active_agreements','agmt_12c7ba0a388bf1f8cdba4e3b96416e9a','{"agreementName":"sg","signedDoc":"/api/assets/download/new_agreement/1778555870575_org_database_schema.pdf"}',1778555874);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_cfbfa0b6664676bd389cfe9a2b7cfe51','user-ceo-new','DELETE','active_agreements','agmt_12c7ba0a388bf1f8cdba4e3b96416e9a',NULL,1778555916);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_de0a610532fbd8ddfc9512fa582d99b5','user-ceo-new','UPDATE','universal_tasks','task_79fd8cebcec6770912a4a64ed1d9e411','{"startDate":"2026-05-12"}',1778557023);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0c8e8500d36d3f5b2afa990325ffae1a','user-ceo-new','UPDATE','universal_tasks','task_79fd8cebcec6770912a4a64ed1d9e411','{"startDate":"2026-05-13"}',1778557029);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_f15256e900bd30b5c0e0c806963b1003','user-ceo-new','UPDATE','universal_tasks','task_79fd8cebcec6770912a4a64ed1d9e411','{"startDate":"2026-05-12"}',1778557033);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_dc97b6299ff7bad455bf1693ed7fec77','user-ceo-new','UPDATE','universal_tasks','task_79fd8cebcec6770912a4a64ed1d9e411','{"startDate":"2026-05-16"}',1778557036);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_f3e08f26a152660c4efeef35c6aca598','user-ceo-new','UPDATE','universal_tasks','task_79fd8cebcec6770912a4a64ed1d9e411','{"startDate":"2026-05-15"}',1778557039);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0eb85b5f535919fd6094da213c8e7c24','user-ceo-new','UPDATE','universal_tasks','task_79fd8cebcec6770912a4a64ed1d9e411','{"dueDate":"2026-05-18"}',1778557042);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_468c545d06b2e274280dfacc724bdda8','user-ceo-new','UPDATE','universal_tasks','task_a7aba5e86c611a71b10691b1460bd0b4','{"title":"jdjfd","description":"","priority":"urgent","status":"in_progress","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":"2026-05-08","dueDate":"2026-05-26","taskType":"urgent","estimatedHours":0}',1778557851);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_764be040ef6fb142f02796ddb5b58675','user-ceo-new','UPDATE','universal_tasks','task_dfba934c05eed50f3eb1d14b3af73170','{"title":"gefgsdfg","description":"","priority":"medium","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":"2026-05-05","dueDate":"2026-05-27","taskType":"operational","estimatedHours":0}',1778557909);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_7a81ebce4154e4e2a67aa72778dd5a5b','user-ceo-new','UPDATE','universal_tasks','task_79fd8cebcec6770912a4a64ed1d9e411','{"startDate":"2026-05-12"}',1778557922);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_e812cd212f93da5cf2486e61c1212f94','user-ceo-new','CREATE','funnels_pipelines','fun_a731262f1854b1a9ed95dfd946fbc256','{"stages":"[{\"name\": \"Awareness\"}, {\"name\": \"Interest\"}, {\"name\": \"Decision\"}]","funnelName":"Lead Gen"}',1778557946);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_cc0beb627dfcbdb3d4193a7d209e8d33','user-ceo-new','UPDATE','universal_tasks','task_a7aba5e86c611a71b10691b1460bd0b4','{"startDate":"2026-05-09"}',1778560177);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_7ab7e95f070d0284d0ac1490691813d2','user-ceo-new','UPDATE','universal_tasks','task_a7aba5e86c611a71b10691b1460bd0b4','{"startDate":"2026-05-11"}',1778560206);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_f5d3034d85244327f48d743506fb4b72','user-ceo-new','UPDATE','universal_tasks','task_a7aba5e86c611a71b10691b1460bd0b4','{"startDate":"2026-05-15"}',1778560211);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_84c13effdcaa3cbe17e6fe9645a6e9b0','user-ceo-new','UPDATE','universal_tasks','task_a7aba5e86c611a71b10691b1460bd0b4','{"startDate":"2026-05-17","dueDate":"2026-05-28"}',1778560218);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_34edead7828715fce14a4839f38c3dc7','user-ceo-new','UPDATE','universal_tasks','task_a7aba5e86c611a71b10691b1460bd0b4','{"dueDate":"2026-05-19"}',1778560226);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_3ff25ac4046b85dffaa14b8e6633b698','user-ceo-new','UPDATE','users_logins','user-ceo-new','{"profile_updated":["name","username","email","phone"]}',1778560701);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_356eead0d3fa3b376be285c1e3565f8f','user-ceo-new','UPDATE','universal_tasks','task_dfba934c05eed50f3eb1d14b3af73170','{"startDate":"2026-05-06","dueDate":"2026-05-28"}',1778560783);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_4c76ae4b6fc38ad2150d6958d754db18','user-ceo-new','UPDATE','universal_tasks','task_dfba934c05eed50f3eb1d14b3af73170','{"startDate":"2026-05-09"}',1778560790);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_53d15a52b2ec49e320582d28371c7283','user-ceo-new','UPDATE','universal_tasks','task_dfba934c05eed50f3eb1d14b3af73170','{"startDate":"2026-05-10"}',1778560799);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ae729a604ca3db69ec7b6fec14359222','user-ceo-new','CREATE','crm_planner_events','evt_81d2cb2e77de227b7e5b67945f2b189e','{"title":"Launch","eventType":"deadline","startDate":"2026-05-28"}',1778561410);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_dcc5e92db608cf55ec4fe62d25eb235d','user-ceo-new','CREATE','crm_planner_events','evt_679b1f9b751e2d86a580d4969d87eb82','{"title":"Ads","description":"sfdgsdfgsfg","eventType":"deadline","startDate":"2026-05-21"}',1778561431);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0d2f51eeb8e8361dd1645deb4418593d','user-ceo-new','UPDATE','universal_tasks','task_79fd8cebcec6770912a4a64ed1d9e411','{"startDate":"2026-05-05"}',1778561720);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1c0eecd93add57dcc61a37b7010dff3b','user-ceo-new','UPDATE','universal_tasks','task_79fd8cebcec6770912a4a64ed1d9e411','{"startDate":"2026-05-13"}',1778561726);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_733fe7f4a2c6394387535da18f8af588','user-ceo-new','UPDATE','universal_tasks','task_79fd8cebcec6770912a4a64ed1d9e411','{"startDate":"2026-05-18"}',1778561735);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ae0d6a745cfcd2b496db21fd39e5d7d8','user-ceo-new','UPDATE','universal_tasks','task_79fd8cebcec6770912a4a64ed1d9e411','{"startDate":"2026-05-19","dueDate":"2026-05-19"}',1778561739);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_17f97032569315a03569f5350ec2e277','user-ceo-new','UPDATE','universal_tasks','task_dfba934c05eed50f3eb1d14b3af73170','{"startDate":"2026-05-26"}',1778561747);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_4fc46d4e7fa8e0312388d39ce4962a0e','user-ceo-new','UPDATE','universal_tasks','task_a7aba5e86c611a71b10691b1460bd0b4','{"startDate":"2026-05-22","dueDate":"2026-05-24"}',1778561753);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_cfc07df033cd1f8e090c1ba3b9a772f5','user-ceo-new','UPDATE','universal_tasks','task_a7aba5e86c611a71b10691b1460bd0b4','{"startDate":"2026-05-21","dueDate":"2026-05-23"}',1778561755);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d91fef9f53b02d9bc074548737ae1018','user-ceo-new','UPDATE','universal_tasks','task_a7aba5e86c611a71b10691b1460bd0b4','{"startDate":"2026-05-20","dueDate":"2026-05-22"}',1778561764);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_6900aa3dc5f020e1247fa3821eb9dfa9','user-ceo-new','UPDATE','universal_tasks','task_a7aba5e86c611a71b10691b1460bd0b4','{"title":"jdjfd","description":null,"status":"completed","priority":"urgent","department":"Tech","taskType":"urgent","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","creatorId":"user-ceo-new","appointmentId":null,"committeeId":null,"boardPosition":0,"relatedEntityId":null,"relatedEntityType":null,"estimatedHours":0,"startDate":"2026-05-20","dueDate":"2026-05-22","type":"task","segmentStart":3,"segmentEnd":5,"isStart":true,"isEnd":true}',1778561771);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_bb8f25ee855a406aaea1aa932d0208f0','user-ceo-new','CREATE','crm_documents','cdoc_38968ead1b560e2ef65ec5a1a8bb344a','{"title":"Faayy Logo","docType":"other","r2Key":"/api/assets/download/upload_institutional_asset/1778561860819_Red Modern Lettering Creative Studio Logo.png"}',1778561865);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d557c6c536758daabb709c29e3ddd83e','user-ceo-new','DELETE','crm_planner_events','evt_679b1f9b751e2d86a580d4969d87eb82',NULL,1778562039);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_319055f2b4b2fb87240694ab3e8ea681','user-ceo-new','DELETE','crm_planner_events','evt_81d2cb2e77de227b7e5b67945f2b189e',NULL,1778562073);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_9ac4e10b7280652529540ec3665b113e','user-ceo-new','CREATE','crm_planner_events','evt_6dc5c055febed579148fa8a362bc1e1c','{"title":"sgsdf","description":"gsfdgsfg","eventType":"review"}',1778562078);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_49bdd4e28489026f04b6f23ce54654cb','user-ceo-new','UPDATE','funnels_pipelines','fun_a731262f1854b1a9ed95dfd946fbc256','{"funnelName":"Lead Gen","conversionRatePct":null,"stages":[{"name":"Awareness","value":45},{"name":"Interest","value":45},{"name":"Decision","value":45}],"leadEntryCount":null,"conversions":null,"campaignId":null}',1778562103);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1983666c354f6f6ff9638223c75515c8','user-ceo-new','UPDATE','crm_planner_events','evt_6dc5c055febed579148fa8a362bc1e1c','{"title":"sgsdf","description":"gsfdgsfg","eventType":"deadline","startDate":null,"endDate":null,"allDay":null,"committeeId":"com_4760192638b3b729601a9d626caf80e6","createdById":"user-ceo-new"}',1778562162);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_5037a12fc8ff1ee1d6eeccb65d55edec','user-ceo-new','DELETE','crm_planner_events','evt_6dc5c055febed579148fa8a362bc1e1c',NULL,1778562167);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_623cca5827ac7cf2a890dba138bed2ed','user-ceo-new','UPDATE','invoices','inv_95e382c5d6a9aa800b20d935ad902253','{"invoiceNumber":"356345","issueDate":"2026-05-01","dueDate":"2026-05-28","amount":3566,"status":"overdue","type":null,"vendorName":null,"description":null,"clientId":"client_105a7426d5313a9e84f32d69b4c20ab4","committeeId":"com_4760192638b3b729601a9d626caf80e6","fundRequestId":null,"invoiceDoc":"/api/assets/download/new_invoice/1778555793380_Red Modern Lettering Creative Studio Logo.png"}',1778562418);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b9a847b5bb3dfdc2687c369795ad2d96','user-ceo-new','CREATE','fund_requests','fr_b873cce70bb2a6752dd539b897624470','{"requestName":"ugh","amountRequested":"456"}',1778562425);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_4aa32dd8541869f26b43d1ca39576f1a','user-ceo-new','CREATE','accounts','acc_76a12788a5473c085e98d579a34fdec2','{"accountName":"365ety","currentBalance":"4356345"}',1778562429);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_9a72d2d0a94dee22153b97f92668fe63','user-ceo-new','UPDATE','fund_requests','fr_b873cce70bb2a6752dd539b897624470','{"requestName":"ugh","requestDate":null,"amountRequested":456,"purpose":null,"approvalStatus":"approved","approvedBy":null,"approvalDate":null,"disbursementStatus":null,"disbursementDate":null,"committeeId":null}',1778562439);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_5dc518257fdbab124b72a86fbec727a8','user-ceo-new','UPDATE','accounts','acc_76a12788a5473c085e98d579a34fdec2','{"accountName":"365ety","accountType":null,"bankName":null,"accountNumber":"ddtyew456","openingBalance":null,"currentBalance":4356345,"currency":null,"status":null}',1778562445);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_cbe27b5680ff03f363bae2cf8cb6b2b7','user-ceo-new','UPDATE','accounts','acc_76a12788a5473c085e98d579a34fdec2','{"accountName":"365ety","accountType":null,"bankName":null,"accountNumber":"ddtyew456","openingBalance":null,"currentBalance":4356345,"currency":null,"status":"closed"}',1778562451);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ffe857bda78684b252fc93aa4b240454','user-ceo-new','UPDATE','funnels_pipelines','fun_a731262f1854b1a9ed95dfd946fbc256','{"funnelName":"Lead Gen","conversionRatePct":null,"stages":[{"name":"Awareness","value":45},{"name":"Interest","value":45},{"name":"Decision","value":44},{"name":"Final CLosing ","value":3456}],"leadEntryCount":"354","conversions":"356","campaignId":null}',1778562557);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c4cb22964323816334fc2cdcf283cafb','user-ceo-new','CREATE','funnels_pipelines','fun_4a9ecec46dbfdd17ec5d6290c80b98c7','{"stages":[{"name":"Awareness"},{"name":"Interest"},{"name":"Decision"}],"funnelName":"weryw"}',1778562572);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1acd79f102b5b0f857d39c071d0bbb8f','user-ceo-new','DELETE','funnels_pipelines','fun_a731262f1854b1a9ed95dfd946fbc256',NULL,1778562577);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_cb1393c62643283a0111ee1ec9b6d0b7','user-ceo-new','CREATE','campaigns','camp_ff23f1b078809399a58678e6830d6f58','{"campaignName":"rtywr"}',1778562582);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_706e4033e3d33c4634f856cd1c9146fe','user-ceo-new','UPDATE','campaigns','camp_ff23f1b078809399a58678e6830d6f58','{"campaignName":"rtywr","type":null,"objective":null,"budget":null,"startDate":null,"endDate":null,"leadsGenerated":"4543","roi":null,"status":null}',1778562586);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1848964fcebd7a09543b3a72b628c1f9','user-ceo-new','CREATE','universal_tasks','task_7b632a54cb90beb71a7557dcf7240b3e','{"title":"xghshsdgh","description":"","priority":"medium","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":"com_4760192638b3b729601a9d626caf80e6","startDate":null,"dueDate":null,"taskType":"operational","estimatedHours":0,"department":"Acquisition"}',1778562627);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_2d234bd50f90db9c27080ed587b61b87','user-ceo-new','UPDATE','universal_tasks','task_7b632a54cb90beb71a7557dcf7240b3e','{"title":"xghshsdgh","description":null,"status":"completed","priority":"medium","department":"Acquisition","taskType":"operational","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","creatorId":"user-ceo-new","appointmentId":null,"committeeId":"com_4760192638b3b729601a9d626caf80e6","boardPosition":0,"relatedEntityId":null,"relatedEntityType":null,"estimatedHours":0,"startDate":null,"dueDate":null,"type":"task","segmentStart":2,"segmentEnd":2,"isStart":true,"isEnd":true}',1778562644);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_eb134409eed1512e45ddfa73f626373d','user-ceo-new','UPDATE','universal_tasks','task_7b632a54cb90beb71a7557dcf7240b3e','{"startDate":"2026-05-15","dueDate":"2026-05-15"}',1778562646);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a57d77684a2aa7886509841ec036182b','user-ceo-new','UPDATE','universal_tasks','task_7b632a54cb90beb71a7557dcf7240b3e','{"dueDate":"2026-05-22"}',1778562649);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_62582703a2f2401525037c5279c12ab0','user-ceo-new','UPDATE','universal_tasks','task_7b632a54cb90beb71a7557dcf7240b3e','{"dueDate":"2026-05-15"}',1778562652);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_cff9c2725d70a589517d52ca18534600','user-ceo-new','UPDATE','universal_tasks','task_7b632a54cb90beb71a7557dcf7240b3e','{"startDate":"2026-05-20","dueDate":"2026-05-20"}',1778562654);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a3da90be97a22de15378d38f45e3489d','user-ceo-new','UPDATE','universal_tasks','task_7b632a54cb90beb71a7557dcf7240b3e','{"startDate":"2026-05-12","dueDate":"2026-05-12"}',1778562656);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_5ab5bda455d3c9bb046bab9baa763a5f','user-ceo-new','DELETE','campaigns','camp_ff23f1b078809399a58678e6830d6f58',NULL,1778562702);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_fd841aed87cf15edcf7304f33b31d91d','user-ceo-new','DELETE','universal_tasks','task_7b632a54cb90beb71a7557dcf7240b3e',NULL,1778562708);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_324343d525c3f30c7b3299ab26b62a40','user-ceo-new','DELETE','funnels_pipelines','fun_4a9ecec46dbfdd17ec5d6290c80b98c7',NULL,1778562712);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b7fd3c46bfda73b66bbdabc917ca2680','user-ceo-new','CREATE','deployments','dep_53c1f3d372ae873868ab7d519796e976','{"deploymentName":"afgwegt"}',1778562788);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ca8c15bb30b8cb2f8ce076656f243b8a','user-ceo-new','UPDATE','deployments','dep_53c1f3d372ae873868ab7d519796e976','{"deploymentName":"afgwegt","deploymentStatus":"success","initiatedBy":null,"startTime":null,"endTime":null,"ciCdResult":null,"rollbackAvailable":null,"logs":null,"projectId":null,"envId":null,"releaseId":null}',1778562794);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_239134569cf085b810d805e6107558da','user-ceo-new','UPDATE','deployments','dep_53c1f3d372ae873868ab7d519796e976','{"deploymentName":"afgwegt","deploymentStatus":"success","initiatedBy":null,"startTime":null,"endTime":null,"ciCdResult":null,"rollbackAvailable":null,"logs":null,"projectId":null,"envId":null,"releaseId":null}',1778562799);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_9309d1376f49794b9c1a29ed2dd0b171','user-ceo-new','UPDATE','deployments','dep_53c1f3d372ae873868ab7d519796e976','{"deploymentName":"afgwegt","deploymentStatus":"queued","initiatedBy":null,"startTime":null,"endTime":null,"ciCdResult":null,"rollbackAvailable":null,"logs":null,"projectId":null,"envId":null,"releaseId":null}',1778562808);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_702e873083983bc7c3203510f5b176e1','user-ceo-new','CREATE','issues','issue_c676a2207b1f85a9c45b10abe421b2b2','{"issueTitle":"wtyetrwy","severity":"high","status":"in_progress"}',1778562832);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_2de056fa6285a19b828f4f5963e65aae','user-ceo-new','UPDATE','issues','issue_c676a2207b1f85a9c45b10abe421b2b2','{"issueTitle":"wtyetrwy","description":null,"severity":"high","status":"open","slaTargetDate":null,"reportedDate":null,"resolvedDate":null,"assignedTo":null,"projectId":null,"storyId":null,"envId":null}',1778562838);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_f24ba87718717940e1f3fbfa0ccebc6a','user-ceo-new','LOGIN','users_logins','user-ceo-new','{"email":"ceo"}',1778580527);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_5c0a45268cc0e010871cf8087fb0e515','user-ceo-new','LOGIN','users_logins','user-ceo-new','{"email":"ceo"}',1778598698);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_017adb99ac69ca606dd5dcd655993ffd','user-ceo-new','UPDATE','clients','client_105a7426d5313a9e84f32d69b4c20ab4','{"clientName":"Faayy Shop","primaryContact":"Farha Iram","contactEmail":"info@faayy.shop","phone":"+92004458194","industry":"Art","address":null,"onboardingDate":"2026-03-01","contractStatus":"active","slaStatus":"green","clientPhoto":"/api/assets/download/update_clients/1778599532261_Red Modern Lettering Creative Studio Logo.png"}',1778599536);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_af06803ae15a90917f12c0a28c65d2a4','user-ceo-new','UPDATE','committees','com_4760192638b3b729601a9d626caf80e6','{"id":"com_4760192638b3b729601a9d626caf80e6","committeeName":"Faayy Shop","type":"technical","opsStatus":"active","purpose":null,"dateFormed":null,"activeStatus":true,"labId":"lab_20ca62803e40284a851bc6500cd818d3","clientId":"client_105a7426d5313a9e84f32d69b4c20ab4"}',1778599585);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_fd79d148b7744fc90831a07a2aa845a1','user-ceo-new','DELETE','appointments','appt_6eab8a7f0c1a677c11344273e9066415',NULL,1778599622);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ef1bdd58b735455a271917ac05175039','user-ceo-new','DELETE','employees','emp_a7cccd4fa4082b0e0b1ba8d1a8539b0a',NULL,1778599628);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d5ae92b1379c72311eca7351b15333b7','user-ceo-new','UPDATE','employees','emp_3dda152e0b8bcbce60d446c4edaa2ebf','{"name":"Saad Naik","slackId":"SL2751","department":"HR,Finance,Tech,Legal,Ops,Acquisition","role":"CEO","email":"saadnaik@icloud.com","phone":"+923184458194","employmentStatus":"active","hireDate":"2022-01-01","baseSalary":200000,"efficiencyScore":90,"profilePhoto":"/api/assets/download/profiles/1778599731820_01803C13-46AF-4AD8-8185-0E7ECEF64D1B.jpeg","sectorId":null}',1778599750);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_abb602531a4c3e83407b2441600d0508','user-ceo-new','UPDATE','users_logins','user-ceo-new','{"profile_updated":["name","username","email","phone"]}',1778599782);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_7c43c6ba522e022970501e1e8d6b9db1','user-ceo-new','UPDATE','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik@godwinausten.org","note":"re-provisioned"}',1778599854);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ad9a04122cc3758a7bf9344164b10bfc','user-ceo-new','UPDATE','appointments','appt_24fbd2610f293bb526a269012fc99807','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"usr_95fbbea2c6df18c4cb8b7dfaf540089c","committeeId":"com_4760192638b3b729601a9d626caf80e6","roleOrTitle":"Project Manager - Faayy Shop","appointmentDate":"2026-05-11","termType":"permanent","isActive":true}',1778599854);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_9443b2ea8805bdb92aa40b93f601b2cc','user-ceo-new','DELETE','universal_tasks','task_dfba934c05eed50f3eb1d14b3af73170',NULL,1778599889);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_e7150e7e60fe8b766c528c917b3783e6','user-ceo-new','DELETE','universal_tasks','task_79fd8cebcec6770912a4a64ed1d9e411',NULL,1778599892);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_79503dacb4adbe598a16fcdbb20e5a50','user-ceo-new','DELETE','universal_tasks','task_a7aba5e86c611a71b10691b1460bd0b4',NULL,1778599894);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a6b48594b278df48cdcebba05ab94cb5','user-ceo-new','UPDATE','employees','emp_3dda152e0b8bcbce60d446c4edaa2ebf','{"name":"Saad Naik","slackId":"U0740CQC8Q6","department":"HR,Finance,Tech,Legal,Ops,Acquisition","role":"CEO","email":"saadnaik@icloud.com","phone":"+923184458194","employmentStatus":"active","hireDate":"2022-01-01","baseSalary":200000,"efficiencyScore":90,"profilePhoto":"/api/assets/download/profiles/1778599731820_01803C13-46AF-4AD8-8185-0E7ECEF64D1B.jpeg","sectorId":null}',1778603386);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_31b0e7a08f3eabfad814a9c2b1d4e498','user-ceo-new','UPDATE','employees','emp_3dda152e0b8bcbce60d446c4edaa2ebf','{"name":"Saad Naik","slackId":"U0740CQC8Q6","department":"HR,Finance,Tech,Legal,Ops,Acquisition","role":"CEO","email":"saadnaik@icloud.com","phone":"+923184458194","employmentStatus":"active","hireDate":"2022-01-01","baseSalary":200000,"efficiencyScore":90,"profilePhoto":"/api/assets/download/profiles/1778603759838_IMG_0836.jpeg","sectorId":null}',1778603766);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_72de2d2b36e4c8453ef13ea2c1c033c6','user-ceo-new','UPDATE','labs','lab_e47d9c3ba50cf3d0433c756d88232fdd','{"id":"lab_e47d9c3ba50cf3d0433c756d88232fdd","labName":"Acquisition Lab","category":"innovation","description":"Internal Lab","status":"active","opsLeadId":null,"labPhoto":null}',1778603819);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_bdfa5b87759288a47fc9c839072b31cd','user-ceo-new','UPDATE','labs','lab_20ca62803e40284a851bc6500cd818d3','{"id":"lab_20ca62803e40284a851bc6500cd818d3","labName":"Tech Lab","category":"development","description":null,"status":"active","opsLeadId":null,"labPhoto":null}',1778603851);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_61a2953e2804849736b07c39caedc1b7','user-ceo-new','CREATE','committees','com_65f5639d2fe384db4eabb4b693fc9329','{"committeeName":"asdfgaf","opsStatus":"pending","type":"advisory"}',1778604705);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d1fcb923b76f2c327c18336d9e6aa5af','user-ceo-new','CREATE','committees','com_63c5f3605810f24d217b7dbf58cef889','{"committeeName":"sfdgsfg","opsStatus":"pending"}',1778604729);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_43e31fbb102a70fae05d674e4bbecf15','user-ceo-new','DELETE','committees','com_65f5639d2fe384db4eabb4b693fc9329',NULL,1778605835);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_8ebee0c04cbfa039aee242afe1fdc077','user-ceo-new','DELETE','committees','com_63c5f3605810f24d217b7dbf58cef889',NULL,1778605838);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c8df1c6365fe4046679445cbaef8e387','user-ceo-new','CREATE','committees','com_9f61f923c5ba287050bd2a3e9fe248c4','{"activeStatus":true,"committeeName":"Acquisition Dept.","opsStatus":"active","purpose":"Company''s internal acquisition committee","dateFormed":"2022-01-01","labId":"lab_e47d9c3ba50cf3d0433c756d88232fdd"}',1778605876);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_bb74c724ff8fdcffe5f8504d40971f56','user-ceo-new','LOGIN','users_logins','user-ceo-new','{"email":"ceo"}',1778777789);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_dd43087b3cd5ab0250fdfd72c0fbf13f','user-ceo-new','CREATE','universal_tasks','task_316c5dec382af613113a6a24d446d502','{"title":"1. Partnership Structure","description":"","priority":"urgent","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":null,"dueDate":"2026-05-17","taskType":"urgent","estimatedHours":0,"department":"General"}',1778778255);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_025b9f235b97e9e4f7a58debb5065434','user-ceo-new','CREATE','universal_tasks','task_8088754cc3a3405d06cb8477926c4066','{"title":"2. Internal Team & Talent System","description":"","priority":"urgent","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":null,"dueDate":"2026-05-17","taskType":"urgent","estimatedHours":0,"department":"General"}',1778778322);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_9db07c24a19f3bfc8ac843e071810e7d','user-ceo-new','CREATE','universal_tasks','task_d2379eec6bb6669a3a3a94c89e723da5','{"title":"3. Product & Service Definition","description":"","priority":"urgent","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":null,"dueDate":"2026-05-17","taskType":"operational","estimatedHours":0,"department":"General"}',1778778356);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a67c1c2f711c78d5a5f85950590aa057','user-ceo-new','CREATE','universal_tasks','task_69cb9e6dc304eadbf5c508230d5c2694','{"title":"4. Pricing Strategy","description":"","priority":"high","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":null,"dueDate":"2026-05-17","taskType":"urgent","estimatedHours":0,"department":"General"}',1778778384);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_2e69d9943edecb50b9b51e6102565b51','user-ceo-new','CREATE','universal_tasks','task_7d50bbcdd8abfcc842833a4fff6a778c','{"title":"Legal Stack (Client-Facing)","description":"","priority":"high","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":null,"dueDate":"2026-05-17","taskType":"urgent","estimatedHours":0,"department":"General"}',1778778408);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0a0f9d590a67131d400947ca7a7a567b','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1778778550);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_4114e480746af54476e0446f5c9b8292','user-ceo-new','LOGIN','users_logins','user-ceo-new','{"email":"ceo"}',1778778597);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c2cfadcac05454a474815d5c2762a21a','user-ceo-new','UPDATE','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik@godwinausten.org","note":"re-provisioned"}',1778778689);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_3afaf204c2e619ea3b4d76ccb1f681ce','user-ceo-new','CREATE','appointments','appt_3d5a595fc6be6cb7e42a8f90c7fd02c3','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"usr_95fbbea2c6df18c4cb8b7dfaf540089c"}',1778778689);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b23f319e1112db6b9e1c18785ccf3f60','user-ceo-new','DELETE','appointments','appt_cbf26872ce07e5e483d0c24e182de6ec',NULL,1778778705);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a8176d0113dca935abc9f19551a4c127','user-ceo-new','UPDATE','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik@godwinausten.org","note":"re-provisioned"}',1778778716);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_fa5a50afd6069b2d08e892e54857801b','user-ceo-new','UPDATE','appointments','appt_3d5a595fc6be6cb7e42a8f90c7fd02c3','{"employeeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","accountId":"usr_95fbbea2c6df18c4cb8b7dfaf540089c","committeeId":"com_f58071c82c4b30994121ace0eba2548c","roleOrTitle":"CEO","appointmentDate":"2022-01-01","termType":"permanent","isActive":true}',1778778716);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_115c131342ef93b0e77ee2e6cbc14cfd','user-ceo-new','UPDATE','employees','emp_3dda152e0b8bcbce60d446c4edaa2ebf','{"name":"Saad Naik","slackId":"U0740CQC8Q6","department":"HR,Finance,Tech,Legal,Ops,Acquisition","role":"CEO","email":"saadnaik@icloud.com","phone":"+923184458194","employmentStatus":"active","hireDate":"2022-01-01","baseSalary":200000,"efficiencyScore":90,"profilePhoto":"/api/assets/download/profiles/1778778749793_01803C13-46AF-4AD8-8185-0E7ECEF64D1B.jpeg","sectorId":null}',1778778758);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_434798f46b3840b44d3ea24b9e1ae814','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1778778775);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a0602a47c783dc7c24b085fda1da36f1','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"profile_updated":["name","username","email","phone"]}',1778778818);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_374b743c670973d5d05e6ce51ea43c9e','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_7d50bbcdd8abfcc842833a4fff6a778c','{"title":"5. Legal Stack (Client-Facing)","description":"","priority":"high","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":null,"dueDate":"2026-05-17","taskType":"urgent","estimatedHours":0}',1778778839);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_895d6019c162b09d5eaec46a888cce8a','usr_95fbbea2c6df18c4cb8b7dfaf540089c','DELETE','issues','issue_c676a2207b1f85a9c45b10abe421b2b2',NULL,1778778904);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_44fa4605bbee78484757e7f4c5e912c4','usr_95fbbea2c6df18c4cb8b7dfaf540089c','DELETE','crm_tickets','tkt_becb8a8e0d27724ebd2446e9f14e5912',NULL,1778779130);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_7d424e8cd7dc6a4826b18c09c76a2e7d','usr_95fbbea2c6df18c4cb8b7dfaf540089c','DELETE','deployments','dep_53c1f3d372ae873868ab7d519796e976',NULL,1778779144);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_7aca8c4e8496dbfad454a2362e01c22e','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','universal_tasks','task_5433ee511c7b7a8fe2aced372c98c70a','{"title":"Minor upgradation of Office","description":"1. Update profile Pic issue\n2. UI matching and Favicon\n3. Meetings section in User Dashboard synced with the Calendar\n\n","priority":"low","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":"com_afeb1eb343de16e1de5b3cf3e6433ef3","startDate":null,"dueDate":"2026-05-22","taskType":"technical","estimatedHours":4,"department":"General"}',1778782877);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_46ed40ec3d22373d2b179648705c90f2','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_5433ee511c7b7a8fe2aced372c98c70a','{"startDate":"2026-05-17"}',1778782915);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_2be4506b569272984165ce14336264f6','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_7d50bbcdd8abfcc842833a4fff6a778c','{"startDate":"2026-05-16"}',1778782923);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_5cb6184c3e6869433c6d6a8a9b171b8c','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_5433ee511c7b7a8fe2aced372c98c70a','{"startDate":"2026-05-19"}',1778782930);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_fc8f1c62fb186b13fd69e14b2cd96a1e','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_7d50bbcdd8abfcc842833a4fff6a778c','{"startDate":"2026-05-14"}',1778782945);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1001db9a0c77e3c7cc5bfe4a93cb8d43','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_7d50bbcdd8abfcc842833a4fff6a778c','{"dueDate":"2026-05-18"}',1778782957);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c6c426941848f8a07fce2646256a01d4','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_7d50bbcdd8abfcc842833a4fff6a778c','{"startDate":"2026-05-17"}',1778782987);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_5aac4a9ced39fce0949177d13319f193','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_7d50bbcdd8abfcc842833a4fff6a778c','{"startDate":"2026-05-18"}',1778782994);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_926cec86235b37bb48507bf377afc72b','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_69cb9e6dc304eadbf5c508230d5c2694','{"startDate":"2026-05-17","dueDate":"2026-05-20"}',1778783045);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_6568a2b6261db514b93b03812b453fad','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_69cb9e6dc304eadbf5c508230d5c2694','{"dueDate":"2026-05-18"}',1778783056);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_fa5d239d95d98b94fb355c46686d818a','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_d2379eec6bb6669a3a3a94c89e723da5','{"startDate":"2026-05-16"}',1778783064);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_7ec2bf7a5f18cb4bc067232d0485f24b','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_8088754cc3a3405d06cb8477926c4066','{"startDate":"2026-05-15"}',1778783067);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a81d97be7d599de6c84396c9b95f306c','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_d2379eec6bb6669a3a3a94c89e723da5','{"dueDate":"2026-05-18"}',1778783078);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_506eb2df0ebd4a8ab845c0b660d508f8','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_316c5dec382af613113a6a24d446d502','{"dueDate":"2026-05-18"}',1778783082);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1cdfbf6a7cc3905b60032b2306890af7','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_8088754cc3a3405d06cb8477926c4066','{"dueDate":"2026-05-18"}',1778783086);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_574fd8677a6e14f21e878db009ad2234','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_69cb9e6dc304eadbf5c508230d5c2694','{"dueDate":"2026-05-17"}',1778783198);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_84bd878d071d0f16bbe826217a8f9035','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_d2379eec6bb6669a3a3a94c89e723da5','{"dueDate":"2026-05-16"}',1778783208);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_67344dedcf61baf6b6c9c92beb8b805d','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_8088754cc3a3405d06cb8477926c4066','{"dueDate":"2026-05-16"}',1778783217);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_54c5bd891ef0f3a64645cce299c8194b','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_316c5dec382af613113a6a24d446d502','{"dueDate":"2026-05-25"}',1778783220);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d27967e171538276602e5fb6b7efbaa6','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_316c5dec382af613113a6a24d446d502','{"dueDate":"2026-05-16"}',1778783225);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c14a887d58bb2f853d746ac6efe08348','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_8088754cc3a3405d06cb8477926c4066','{"dueDate":"2026-05-15"}',1778783233);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_2b43d0a3e94e9b40e50c94eb67b52a03','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_8088754cc3a3405d06cb8477926c4066','{"startDate":"2026-05-14"}',1778783246);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d730eb78c1df6ce4aea821e6935dc6ab','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_8088754cc3a3405d06cb8477926c4066','{"startDate":"2026-05-15"}',1778783256);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b7c69a5d81544cd3560906eca5c336f1','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_316c5dec382af613113a6a24d446d502','{"dueDate":"2026-05-15"}',1778783265);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d4b2ca96aea44e676d279676a7722bba','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_8088754cc3a3405d06cb8477926c4066','{"dueDate":"2026-05-16"}',1778783275);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_64088c28d420ccb8c0295414ba4c5820','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_8088754cc3a3405d06cb8477926c4066','{"dueDate":"2026-05-15"}',1778783284);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_51909320ba41530207d44bf08f8a8cea','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_8088754cc3a3405d06cb8477926c4066','{"startDate":"2026-05-14"}',1778783289);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_8ffcba818110f3502b264edb025a02f6','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_d2379eec6bb6669a3a3a94c89e723da5','{"startDate":"2026-05-14"}',1778783292);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c6ac49c3c68470a0a8e6b600e150651d','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_69cb9e6dc304eadbf5c508230d5c2694','{"startDate":"2026-05-07"}',1778783300);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0a9e423991ed4ea5862a32970c9e28f4','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_69cb9e6dc304eadbf5c508230d5c2694','{"startDate":"2026-05-14"}',1778783308);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_076a77d79132678afa16f7bde0adbb0f','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_5433ee511c7b7a8fe2aced372c98c70a','{"title":"Minor upgradation of Office","description":"1. Update profile Pic issue\n2. UI matching and Favicon\n3. Meetings section in User Dashboard synced with the Calendar\n\n","status":"todo","priority":"low","department":"General","taskType":"technical","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","creatorId":"usr_95fbbea2c6df18c4cb8b7dfaf540089c","appointmentId":null,"committeeId":"com_afeb1eb343de16e1de5b3cf3e6433ef3","boardPosition":0,"relatedEntityId":null,"relatedEntityType":null,"estimatedHours":4,"startDate":"2026-05-19","dueDate":"2026-05-22","type":"task","segmentStart":2,"segmentEnd":5,"isStart":true,"isEnd":true}',1778783317);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_6cec00e96811129e3ab331a4daa646a1','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_7d50bbcdd8abfcc842833a4fff6a778c','{"startDate":"2026-05-07"}',1778783321);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_46874aa764c138ad3c29c525e007cae6','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_7d50bbcdd8abfcc842833a4fff6a778c','{"startDate":"2026-05-14"}',1778783330);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_4c83c4e63e66ce5d160da35bc2d7c00b','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_d2379eec6bb6669a3a3a94c89e723da5','{"dueDate":"2026-05-17"}',1778783397);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_51c0f565e2bfe78d924c35c198533367','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_5433ee511c7b7a8fe2aced372c98c70a','{"startDate":"2026-05-18"}',1778783409);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ad702d3c6a4c56a37cde106cae6a3ce7','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_5433ee511c7b7a8fe2aced372c98c70a','{"startDate":"2026-05-19"}',1778783413);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0a00f20924f82448b4d10f2941661aa3','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_7d50bbcdd8abfcc842833a4fff6a778c','{"dueDate":"2026-05-17"}',1778783422);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_89967825f4f564deea4614d4748fedc5','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_7d50bbcdd8abfcc842833a4fff6a778c','{"dueDate":"2026-05-18"}',1778783463);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_fb82dd852388761ccca1536eb86525c6','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1778783509);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_6a4950cb44c06878aa2511edb14d30e5','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','employees','emp_3dda152e0b8bcbce60d446c4edaa2ebf','{"name":"Saad Naik","slackId":"U0740CQC8Q6","department":"HR,Finance,Tech,Legal,Ops,Acquisition","role":"CEO","email":"saadnaik@icloud.com","phone":"+923184458194","employmentStatus":"active","hireDate":"2022-01-01","baseSalary":200000,"efficiencyScore":90,"profilePhoto":"/api/assets/download/profiles/1778783538769_IMG_0836.jpeg","sectorId":null}',1778783547);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b036d2c8fd7ba1504a73c4ff157b084b','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','employees','emp_3dda152e0b8bcbce60d446c4edaa2ebf','{"name":"Saad Naik","slackId":"U0740CQC8Q6","department":"HR,Finance,Tech,Legal,Ops,Acquisition","role":"CEO","email":"saadnaik@icloud.com","phone":"+923184458194","employmentStatus":"active","hireDate":"2022-01-01","baseSalary":0,"efficiencyScore":90,"profilePhoto":"/api/assets/download/profiles/1778783538769_IMG_0836.jpeg","sectorId":null}',1778783604);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_04c9038d00661359d565f3e2b0d135ca','usr_95fbbea2c6df18c4cb8b7dfaf540089c','DELETE','active_agreements','agmt_2245a21bd29bc74b112cc514ba861f63',NULL,1778783702);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d7cc1e1fd8b48e1dcacc84aae35239d8','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','universal_tasks','task_dfc61c6adf42e7c63f8db421336ae36e','{"title":"Form File Upload Issue","description":"","priority":"high","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":"com_afeb1eb343de16e1de5b3cf3e6433ef3","startDate":null,"dueDate":"2026-05-20","taskType":"technical","estimatedHours":0,"department":"Legal"}',1778783996);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_2dd20a919aacdaf585f68c5cf6b9f04a','usr_95fbbea2c6df18c4cb8b7dfaf540089c','DELETE','universal_tasks','task_dfc61c6adf42e7c63f8db421336ae36e',NULL,1778784010);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_7fc627001394a8e580aca6771d34bbea','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','universal_tasks','task_fd0ee4066a787b155ae4196d183af5cd','{"title":"Template Files Issue","description":"Legal Dept is unable to upload files in the templates","priority":"high","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":"com_afeb1eb343de16e1de5b3cf3e6433ef3","startDate":null,"dueDate":"2026-05-21","taskType":"technical","estimatedHours":0,"department":"Tech"}',1778784077);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d04a1ca7582fffa2da09e77c2ae0e942','usr_95fbbea2c6df18c4cb8b7dfaf540089c','DELETE','invoices','inv_95e382c5d6a9aa800b20d935ad902253',NULL,1778784317);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d6ede6874612be52f0a30e131ec62228','usr_95fbbea2c6df18c4cb8b7dfaf540089c','DELETE','fund_requests','fr_b873cce70bb2a6752dd539b897624470',NULL,1778784321);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b3212398d346989cdce351ebe3d0d96f','usr_95fbbea2c6df18c4cb8b7dfaf540089c','DELETE','accounts','acc_76a12788a5473c085e98d579a34fdec2',NULL,1778784326);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a2e43df6bf0df0aa44a43e0f7a072ce8','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','funnels_pipelines','fun_7e3b1126acf82fdfab1bb65b6b03102a','{"funnelName":"Lead Generation Funnel","leadEntryCount":"230","conversions":"12","stages":[{"name":"Awareness","value":230},{"name":"Contact","value":25},{"name":"Conversion","value":12}]}',1778784433);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c22d5be15c698e5ab91822d435cf8f3d','usr_95fbbea2c6df18c4cb8b7dfaf540089c','DEPROVISION','committees','com_f58071c82c4b30994121ace0eba2548c','{"action":"full_crm_cleanup"}',1778784506);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_bffb13bfa82e48ffe0c03e12e41591e5','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1778784556);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_3ad44a77ea41c98b90ca0ee856c0a034','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779009694);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1ae90e4bf688842aec0c57aaa03ee409','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779009699);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_8793187e8827ae9ebc6d31f2e40098db','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779009711);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0116eff3a0a706bddc89a3983caa240a','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779009733);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_18efdfe419682cc4092555f146bec83b','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779011572);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_3b8639d5a2b437e5ae80d220ea1ca0ed','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779011577);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_f2b4fcc86ca11c21e45f2eb6f5b7a792','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779011750);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_66269a64d27e715de5e1f82cc1dc4ad5','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779011757);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_7d7563a016da232fd84dc4dfc85295b3','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779011758);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_528340d17ed59f0971723cbad6af9843','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779012029);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a66acf74d1f8dae6d6063696bbeab623','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779013523);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_3355029618c0b31efbbba62f7d604b78','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779013529);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_53d8609d4b27be7f6df124a21e987398','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779013571);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_158ab45e06cf627cb8f346bd8de3b8bd','usr_9b72d0b17220fa994e1ccb93d05413bc','LOGIN','users_logins','usr_9b72d0b17220fa994e1ccb93d05413bc','{"email":"hashirrauf"}',1779013581);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_79c194baafe8d15a57b924ff7d21b182','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779016122);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_7eec606672b91dc2d5f1446d5f1ff768','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779016197);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_209ef374e1a5be5c45cc5ed2c781b89e','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779016841);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_505322656f9cd4be7c1ca4199b0b763c','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','intellectual_property','ip_77247b479abe6995a573bc274b7bbea3','{"assetName":"sdfgsdfg","status":"active"}',1779037458);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_42941218894dfb54980f71a1cc388506','usr_95fbbea2c6df18c4cb8b7dfaf540089c','DELETE','intellectual_property','ip_77247b479abe6995a573bc274b7bbea3',NULL,1779037464);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_023d67263cdcf362a379f62cf362106c','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','legal_requests','lreq_19f849b89d184c986143a172273dcbd9','{"requestTitle":"dsfgsdf"}',1779037472);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_bb7c66d111ffd28d98b16bb673a84d0f','usr_95fbbea2c6df18c4cb8b7dfaf540089c','DELETE','legal_requests','lreq_19f849b89d184c986143a172273dcbd9',NULL,1779037476);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_30410dfa1208b23b37dcfd97270187b2','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','legal_sops','sop_c155b7f255d074eabc56aceb826744e4','{"sopTitle":"sdfgsdfg","docAttachment":"/api/assets/download/new_sop/1779037483165_DPA.pdf"}',1779037522);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0cdc4688b16ab7494ea438b07967a950','usr_95fbbea2c6df18c4cb8b7dfaf540089c','DELETE','legal_sops','sop_c155b7f255d074eabc56aceb826744e4',NULL,1779037576);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_9661cf960b267b83e31572e6ce440523','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','legal_templates','tmpl_02e2dca40fa4ce10bfe8cb3f04834392','{"documentName":"MSA","versionNumber":"1","approvedBy":"Saad NAIK","isLatest":true,"templateFile":"/api/assets/download/new_template/1779037665623_MSA.pdf"}',1779037769);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_42df4e9a106717abb59207935412ec39','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','legal_templates','tmpl_cf35ca45ed3e5cb9828cc91fd1e37006','{"documentName":"DPA","versionNumber":"1","approvedBy":"Saad Naik","isLatest":true,"templateFile":"/api/assets/download/new_template/1779037800114_DPA.pdf"}',1779037829);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ba2e0b806eb2c3eff31127002f7ae465','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','legal_templates','tmpl_6a2c0c21b05505908bc70dbe04a95e5b','{"documentName":"NDA","versionNumber":"1","approvedBy":"Saad Naik","isLatest":true,"templateFile":"/api/assets/download/new_template/1779037854511_NDA.pdf"}',1779038098);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_ab9cc5e1296572e876c1f3bec7d3a497','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','legal_templates','tmpl_396ed215bea20159597f86f637aebd4e','{"documentName":"SoW","versionNumber":"1","approvedBy":"Saad Naik","isLatest":true,"templateFile":"/api/assets/download/new_template/1779038123814_Statement of Work.pdf"}',1779038159);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_adee7d75eb4c44fb7ef141dd6e58eecb','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','legal_templates','tmpl_f68d125f9f9b61ca01b2d907d49d996a','{"documentName":"SLA","versionNumber":"1","approvedBy":"Saad Naik","isLatest":true,"templateFile":"/api/assets/download/new_template/1779038177939_SLA.pdf"}',1779038278);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_7f32ac141bb620984884c2e3c513a7c0','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_7d50bbcdd8abfcc842833a4fff6a778c','{"dueDate":"2026-05-20"}',1779042028);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_5002c29c2f6ce5b7bdf0a678fdea367d','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_7d50bbcdd8abfcc842833a4fff6a778c','{"dueDate":"2026-05-19"}',1779042033);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_7181eeecd64b9386e64b8ba51720dadc','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_69cb9e6dc304eadbf5c508230d5c2694','{"dueDate":"2026-05-19"}',1779042039);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c6a6b60ff0454e186ea63c8e108cf132','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_d2379eec6bb6669a3a3a94c89e723da5','{"dueDate":"2026-05-19"}',1779042044);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_5e12686d1d746ead8070a8d196ed43da','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_8088754cc3a3405d06cb8477926c4066','{"dueDate":"2026-05-26"}',1779042052);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_151f7000c4a033c94f503011dcc9f5f2','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_316c5dec382af613113a6a24d446d502','{"dueDate":"2026-05-26"}',1779042059);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a93c98157efd3fccfc6b80358ad8cd0d','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_8088754cc3a3405d06cb8477926c4066','{"dueDate":"2026-05-16"}',1779042065);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_6f88c277ae549b71fceb4f3c01064621','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_316c5dec382af613113a6a24d446d502','{"dueDate":"2026-05-23"}',1779042070);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_edbd8cb087062927b7aa85015dc1ce75','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_316c5dec382af613113a6a24d446d502','{"dueDate":"2026-05-19"}',1779042076);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_e17cb3af7b471f6be682b7616769df82','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779185257);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_2d4b19f4720cd2fc71a901a390dfa486','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779211434);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_322d4682bc433d612dbb12f193d7316a','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779211565);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_48ac0e84a75b75b5e05d589d2ad66707','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_316c5dec382af613113a6a24d446d502','{"title":"1. Partnership Structure","description":"","priority":"urgent","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":null,"dueDate":"2026-05-22","taskType":"urgent","estimatedHours":0}',1779211658);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_53204735de2b60f31eb62cca139d492a','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_8088754cc3a3405d06cb8477926c4066','{"title":"2. Internal Team & Talent System","description":"","priority":"urgent","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":"2026-05-14","dueDate":"2026-05-22","taskType":"urgent","estimatedHours":0}',1779211679);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b16466e5bf252558dd734499e1126355','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_d2379eec6bb6669a3a3a94c89e723da5','{"title":"3. Product & Service Definition","description":"","priority":"urgent","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":"2026-05-14","dueDate":"2026-05-22","taskType":"operational","estimatedHours":0}',1779211690);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_eb8c7849515e7d521f898f9325bb8181','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_69cb9e6dc304eadbf5c508230d5c2694','{"title":"4. Pricing Strategy","description":"","priority":"high","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":"2026-05-14","dueDate":"2026-05-22","taskType":"urgent","estimatedHours":0}',1779211700);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_f107fcaddf3e6047f31e0ccd0bab8a39','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_7d50bbcdd8abfcc842833a4fff6a778c','{"title":"5. Legal Stack (Client-Facing)","description":"","priority":"high","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":"2026-05-14","dueDate":"2026-05-22","taskType":"urgent","estimatedHours":0}',1779211713);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b4663bd329c266515e22891611ba26b9','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779422266);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0fcfc327f9ddb6bb5b0fd86a29f536cb','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779424964);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_3dd00f434cb3c1c39243a568c204dcc7','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_fd0ee4066a787b155ae4196d183af5cd','{"dueDate":"2026-05-22"}',1779424986);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c051b5e16cca62eff3dd4af5f9dc860f','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_316c5dec382af613113a6a24d446d502','{"dueDate":"2026-05-21"}',1779425000);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_f44eee76deb4619d5e00ef8c1a58aad4','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_316c5dec382af613113a6a24d446d502','{"dueDate":"2026-05-29"}',1779425006);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_40a6c9a46cf0494f4037021f9a91149b','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_316c5dec382af613113a6a24d446d502','{"dueDate":"2026-05-22"}',1779425008);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_6fccf7976434ff96005a1138234da777','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_316c5dec382af613113a6a24d446d502','{"status":"completed"}',1779539742);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_438351d24a7ed92e11e36299053a76a2','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779540011);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_02219c29c96cd5ba685a51da6a33dac1','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779591713);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d7d7d1ca84fb82fc65d70f670e4184b5','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_fd0ee4066a787b155ae4196d183af5cd','{"title":"Template Files Issue","description":"Legal Dept is unable to upload files in the templates","priority":"high","status":"completed","assigneeId":null,"committeeId":"com_afeb1eb343de16e1de5b3cf3e6433ef3","startDate":null,"dueDate":"2026-05-22","taskType":"technical","estimatedHours":0}',1779592528);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_7ef5a0ef41999d7225f382c0755463e3','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','universal_tasks','task_5ef14a7111c69c5433f7aac165d64022','{"assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","department":"Legal","description":"Research and draft IP protection agreement for partnership","status":"todo","title":"IP Protection"}',1779592704);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_c39190b5e20516174126d22df1dfc209','usr_95fbbea2c6df18c4cb8b7dfaf540089c','DELETE','universal_tasks','task_5ef14a7111c69c5433f7aac165d64022',NULL,1779594457);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_d55bed0b081e7b9f5e50e2a9c60a4c84','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_5433ee511c7b7a8fe2aced372c98c70a','{"assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","dueDate":"2026-05-23"}',1779595217);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a5107667007692ab1b0ce43b75d436b9','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_5433ee511c7b7a8fe2aced372c98c70a','{"dueDate":"2026-05-25"}',1779595319);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_2910483e51007c614d90c105911d7e1d','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"profile_updated":["name","username","email","phone"]}',1779598199);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_02158e22fb53c79f4ea180ceed84a224','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','universal_tasks','task_fd0ee4066a787b155ae4196d183af5cd','{"title":"Avatar Issue","description":"Avatar is not being loaded","priority":"high","status":"in_progress","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":"com_afeb1eb343de16e1de5b3cf3e6433ef3","startDate":null,"dueDate":"2026-05-22","taskType":"technical","estimatedHours":0}',1779599036);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0d13be38d84cb9d6703e4facb965604e','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','universal_tasks','task_6a733d2cb1d3c872b4d9ebdcb1f6b8d7','{"title":"Test task","description":"","priority":"medium","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":null,"dueDate":null,"taskType":"operational","estimatedHours":0,"department":"Tech"}',1779599143);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_22804d837dbd349a49aa6649edfaf34d','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','universal_tasks','task_2a14b6ac1bd5e3752c2f25178ac55e3f','{"title":"adsfadf","description":"","priority":"medium","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":null,"dueDate":null,"taskType":"operational","estimatedHours":0,"department":"General"}',1779599257);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0b63585c1f1b22344ec97cb381fa92fa','usr_95fbbea2c6df18c4cb8b7dfaf540089c','DELETE','universal_tasks','task_2a14b6ac1bd5e3752c2f25178ac55e3f',NULL,1779599803);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0508c5140e7f848a1c9901abb57e32af','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','universal_tasks','task_c729f56e4c287460911e7ea8dec2a2fb','{"title":"adfadsf","description":"","priority":"medium","status":"todo","assigneeId":"emp_3dda152e0b8bcbce60d446c4edaa2ebf","committeeId":null,"startDate":null,"dueDate":null,"taskType":"operational","estimatedHours":0,"department":"General"}',1779599810);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_957c2045026b747c6c7dc651d570ec58','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','employees','emp_1c9968c84fd8c49831a30c63babd5298','{"name":"Test User","slackId":"U0B5W563XGR","department":"Tech","employmentStatus":"active","hireDate":"","baseSalary":0,"efficiencyScore":0,"profilePhoto":null,"sectorId":""}',1779600110);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_0bc81a08dd34f344635d86e2d0874c82','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779600318);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_6d0b68f50c29e69bd32bed9421f8c3d0','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779600354);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_8adc45186a06f62c81f6c4f4f340898d','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"profile_updated":["name","username","email","phone"]}',1779601255);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b62941380e6e4fd25181bdd5a65c3de2','usr_95fbbea2c6df18c4cb8b7dfaf540089c','DELETE','employees','emp_1c9968c84fd8c49831a30c63babd5298',NULL,1779603548);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_4d4b660c8cc1e4e62d0b902dcb1e23ea','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','employees','emp_3e4ef151184bcccc5e29907150797080','{"name":"test","slackId":"U0B5W563XGR","department":"Tech","employmentStatus":"active","hireDate":"","baseSalary":0,"efficiencyScore":0,"profilePhoto":null,"sectorId":""}',1779603606);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_1903ce8248798b45ee87e04a005004ab','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','users_logins','usr_22f5b2d7f89240a1e4dfb3190d725da6','{"email":"saadnaik@gmail.com"}',1779620652);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_a0f48ba83facb45cf9b2760c330aee8a','usr_95fbbea2c6df18c4cb8b7dfaf540089c','CREATE','appointments','appt_0297619b449f8f0f0716b4d90755068d','{"employeeId":"emp_3e4ef151184bcccc5e29907150797080","accountId":"usr_22f5b2d7f89240a1e4dfb3190d725da6"}',1779620652);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_80ef63830559ac62b348a81e474391bd','usr_22f5b2d7f89240a1e4dfb3190d725da6','LOGIN','users_logins','usr_22f5b2d7f89240a1e4dfb3190d725da6','{"email":"testuser"}',1779620685);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_b6a32023861774a8e35988b2418747dc','usr_95fbbea2c6df18c4cb8b7dfaf540089c','LOGIN','users_logins','usr_95fbbea2c6df18c4cb8b7dfaf540089c','{"email":"saadnaik"}',1779620827);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_27d61921411765ead01bc64bdd9c94e0','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','users_logins','usr_22f5b2d7f89240a1e4dfb3190d725da6','{"email":"saadnaik@gmail.com","note":"re-provisioned"}',1779620854);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_dc9f94baa5cc091e0df2bd5d339aff08','usr_95fbbea2c6df18c4cb8b7dfaf540089c','UPDATE','appointments','appt_0297619b449f8f0f0716b4d90755068d','{"employeeId":"emp_3e4ef151184bcccc5e29907150797080","accountId":"usr_22f5b2d7f89240a1e4dfb3190d725da6","committeeId":null,"roleOrTitle":"test","appointmentDate":"2026-05-24","termType":"permanent","isActive":true}',1779620854);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_606abac50efd421014eebb58b0913acf','usr_22f5b2d7f89240a1e4dfb3190d725da6','CREATE','universal_tasks','task_5e2d102ae3dcc8a690fd4edc508918a5','{"title":"Particle","department":"Tech"}',1779621073);
INSERT INTO "audit_logs" ("id","user_id","action","table_name","record_id","details","timestamp") VALUES('log_e09ab6fa07d54ede7a98510d10d0611d','usr_22f5b2d7f89240a1e4dfb3190d725da6','UPDATE','universal_tasks','task_5e2d102ae3dcc8a690fd4edc508918a5','{"assigneeId":"emp_3e4ef151184bcccc5e29907150797080"}',1779621122);
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-employee','view_employee',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_edit-employee','edit_employee',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_delete-employee','delete_employee',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-payroll','view_payroll',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_edit-payroll','edit_payroll',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-appointments','view_appointments',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_edit-appointments','edit_appointments',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-legal-tracker','view_legal_tracker',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_edit-legal-tracker','edit_legal_tracker',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-sectors','view_sectors',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_edit-sectors','edit_sectors',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-transactions','view_transactions',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_create-transaction','create_transaction',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_approve-transaction','approve_transaction',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-invoices','view_invoices',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_create-invoice','create_invoice',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-fund-requests','view_fund_requests',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_approve-fund-request','approve_fund_request',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-accounts','view_accounts',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_edit-accounts','edit_accounts',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-pl-reports','view_pl_reports',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-agreements','view_agreements',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_create-agreement','create_agreement',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_sign-agreement','sign_agreement',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-compliance','view_compliance',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_edit-compliance','edit_compliance',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-ip','view_ip',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_edit-ip','edit_ip',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-projects','view_projects',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_edit-projects','edit_projects',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-tasks','view_tasks',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_create-task','create_task',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_edit-task','edit_task',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-deployments','view_deployments',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_trigger-deployment','trigger_deployment',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-campaigns','view_campaigns',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_edit-campaigns','edit_campaigns',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-leads','view_leads',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_edit-leads','edit_leads',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_provision-user','provision_user',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_deactivate-user','deactivate_user',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_approve-reset','approve_reset',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_reassign-ownership','reassign_ownership',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_view-audit-logs','view_audit_logs',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_manage-roles','manage_roles',1778428980);
INSERT INTO "permissions" ("id","name","created_at") VALUES('perm_manage-api-keys','manage_api_keys',1778428980);
	`role_id` text NOT NULL,
	`permission_id` text NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-employee');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-employee');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_delete-employee');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-payroll');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-payroll');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-appointments');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-appointments');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-legal-tracker');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-legal-tracker');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-sectors');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-sectors');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-transactions');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_create-transaction');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_approve-transaction');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-invoices');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_create-invoice');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-fund-requests');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_approve-fund-request');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-accounts');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-accounts');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-pl-reports');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-agreements');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_create-agreement');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_sign-agreement');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-compliance');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-compliance');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-ip');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-ip');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-projects');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-projects');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-tasks');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_create-task');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-task');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-deployments');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_trigger-deployment');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-campaigns');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-campaigns');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-leads');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-leads');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_provision-user');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_deactivate-user');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_approve-reset');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_reassign-ownership');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-audit-logs');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_manage-roles');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_manage-api-keys');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_view-employee');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_edit-employee');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_view-payroll');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_view-appointments');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_edit-appointments');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_view-sectors');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_provision-user');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_deactivate-user');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_approve-reset');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_view-audit-logs');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-employee');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-employee');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_delete-employee');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-payroll');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-payroll');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-appointments');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-appointments');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-legal-tracker');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-legal-tracker');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-sectors');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-sectors');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-transactions');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_create-transaction');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_approve-transaction');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-invoices');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_create-invoice');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-fund-requests');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_approve-fund-request');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-accounts');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-accounts');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-pl-reports');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-agreements');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_create-agreement');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_sign-agreement');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-compliance');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-compliance');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-ip');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-ip');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-projects');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-projects');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-tasks');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_create-task');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-task');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-deployments');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_trigger-deployment');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-campaigns');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-campaigns');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-leads');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_edit-leads');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_provision-user');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_deactivate-user');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_approve-reset');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_reassign-ownership');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_view-audit-logs');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_manage-roles');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_ceo','perm_manage-api-keys');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_view-employee');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_edit-employee');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_view-payroll');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_view-appointments');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_edit-appointments');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_view-sectors');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_provision-user');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_deactivate-user');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_approve-reset');
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES('role_hr','perm_view-audit-logs');
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
INSERT INTO "roles" ("id","name","created_at") VALUES('role_ceo','CEO','2026-05-10 13:42:12');
INSERT INTO "roles" ("id","name","created_at") VALUES('role_hr','HR_Manager',1778428980);
INSERT INTO "roles" ("id","name","created_at") VALUES('role_finance','Finance_Manager',1778428980);
INSERT INTO "roles" ("id","name","created_at") VALUES('role_legal','Legal_Officer',1778428980);
INSERT INTO "roles" ("id","name","created_at") VALUES('role_tech','Tech_Lead',1778428980);
INSERT INTO "roles" ("id","name","created_at") VALUES('role_acq','Marketing_Lead',1778428980);
INSERT INTO "roles" ("id","name","created_at") VALUES('role_emp','Employee',1778428980);
INSERT INTO "roles" ("id","name","created_at") VALUES('role_agent','Agent',1778428980);
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role_id` text NOT NULL,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL, last_login_at integer, failed_attempts integer DEFAULT 0 NOT NULL, locked_until integer, created_by_user_id text, password_updated_at integer, name text, username text, is_superadmin INTEGER DEFAULT 0, phone TEXT,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO "users_logins" ("id","employee_id","email","password_hash","role_id","is_active","created_at","last_login_at","failed_attempts","locked_until","created_by_user_id","password_updated_at","name","username","is_superadmin","phone") VALUES('user_admin',NULL,'admin@ganova.os','ef92b778bafe42154857d03cb8d99f1f8e9f60def6b09f475f5d889140d392df','role_ceo',1,'2026-05-10 13:42:12',NULL,0,NULL,NULL,NULL,NULL,NULL,0,NULL);
INSERT INTO "users_logins" ("id","employee_id","email","password_hash","role_id","is_active","created_at","last_login_at","failed_attempts","locked_until","created_by_user_id","password_updated_at","name","username","is_superadmin","phone") VALUES('usr_95fbbea2c6df18c4cb8b7dfaf540089c','emp_3dda152e0b8bcbce60d446c4edaa2ebf','saadnaik@godwinausten.org','f45eb701b6e9f51b3f32c182932bc44f05ef20d581da9e97fd6465d9adaff6d3','role_emp',1,1778488861,1779620827,0,NULL,'user_ceo-001',1778778689,'Saad Naik','saadnaik',1,'+923184458194');
INSERT INTO "users_logins" ("id","employee_id","email","password_hash","role_id","is_active","created_at","last_login_at","failed_attempts","locked_until","created_by_user_id","password_updated_at","name","username","is_superadmin","phone") VALUES('usr_9b72d0b17220fa994e1ccb93d05413bc','emp_a7cccd4fa4082b0e0b1ba8d1a8539b0a','hashirrauf@godwinausten.org','92aa790241cd23a12dea80a77a9230bc8175fad55c91bddd76060825ee300d5f','role_tech',1,1778500074,1779013581,0,NULL,'user_ceo-001',NULL,'Hashir Rauf','hashirrauf',0,NULL);
INSERT INTO "users_logins" ("id","employee_id","email","password_hash","role_id","is_active","created_at","last_login_at","failed_attempts","locked_until","created_by_user_id","password_updated_at","name","username","is_superadmin","phone") VALUES('user-ceo-new','emp_3dda152e0b8bcbce60d446c4edaa2ebf','ceo@godwinausten.org','71cb150dc14504ad66ff08538caf5c7f1f47d392da51f96cc28d96ad20feba31','role-ceo',1,1778509686,1778778597,2,NULL,NULL,1778511054,'Saad Naik','ceo',1,'+923184458194');
INSERT INTO "users_logins" ("id","employee_id","email","password_hash","role_id","is_active","created_at","last_login_at","failed_attempts","locked_until","created_by_user_id","password_updated_at","name","username","is_superadmin","phone") VALUES('user-hr-new',NULL,'hr@godwinausten.org','f0ce0e86206541c60bc47be815f83eba98004f63c883e6d71ff5cc929cb5f9ca','role-hr',1,1778509686,NULL,0,NULL,NULL,NULL,'HR Manager','hrmanager',0,NULL);
INSERT INTO "users_logins" ("id","employee_id","email","password_hash","role_id","is_active","created_at","last_login_at","failed_attempts","locked_until","created_by_user_id","password_updated_at","name","username","is_superadmin","phone") VALUES('usr_22f5b2d7f89240a1e4dfb3190d725da6','emp_3e4ef151184bcccc5e29907150797080','saadnaik@gmail.com','ae5deb822e0d71992900471a7199d0d95b8e7c9d05c40a8245a281fd2c1d6684','role_emp',1,1779620652,1779620685,0,NULL,'usr_95fbbea2c6df18c4cb8b7dfaf540089c',NULL,'testuser','testuser',0,NULL);
	`client_id` text PRIMARY KEY NOT NULL,
	`client_name` text NOT NULL,
	`primary_contact` text,
	`contact_email` text,
	`phone` text,
	`industry` text,
	`address` text,
	`onboarding_date` text,
	`contract_status` text,
	`sla_status` text,
	`client_photo` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
INSERT INTO "clients" ("client_id","client_name","primary_contact","contact_email","phone","industry","address","onboarding_date","contract_status","sla_status","client_photo","created_at","updated_at") VALUES('client_105a7426d5313a9e84f32d69b4c20ab4','Faayy Shop','Farha Iram','info@faayy.shop','+92004458194','Art',NULL,'2026-03-01','active','green','/api/assets/download/update_clients/1778599532261_Red Modern Lettering Creative Studio Logo.png',1778486262,1778599536);
	`committee_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`role_in_committee` text,
	`joined_at` text,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO "committee_members" ("committee_id","employee_id","role_in_committee","joined_at") VALUES('com_4760192638b3b729601a9d626caf80e6','emp_3dda152e0b8bcbce60d446c4edaa2ebf','Member','2026-05-11T16:13:07.250Z');
	`committee_id` text PRIMARY KEY NOT NULL,
	`committee_name` text NOT NULL,
	`type` text,
	`ops_status` text,
	`purpose` text,
	`date_formed` text,
	`active_status` integer,
	`lab_id` text,
	`client_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`lab_id`) REFERENCES `labs`(`lab_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO "committees" ("committee_id","committee_name","type","ops_status","purpose","date_formed","active_status","lab_id","client_id","created_at","updated_at") VALUES('com_4760192638b3b729601a9d626caf80e6','Faayy Shop','technical','active',NULL,NULL,1,'lab_20ca62803e40284a851bc6500cd818d3','client_105a7426d5313a9e84f32d69b4c20ab4',1778499276,1778599585);
INSERT INTO "committees" ("committee_id","committee_name","type","ops_status","purpose","date_formed","active_status","lab_id","client_id","created_at","updated_at") VALUES('com_afeb1eb343de16e1de5b3cf3e6433ef3','Tech Dept.','Internal Department','active',NULL,NULL,1,NULL,NULL,1778511565,1778511565);
INSERT INTO "committees" ("committee_id","committee_name","type","ops_status","purpose","date_formed","active_status","lab_id","client_id","created_at","updated_at") VALUES('com_f58071c82c4b30994121ace0eba2548c','Board of Directors','Director Committee','active',NULL,NULL,1,NULL,NULL,1778511623,1778511623);
INSERT INTO "committees" ("committee_id","committee_name","type","ops_status","purpose","date_formed","active_status","lab_id","client_id","created_at","updated_at") VALUES('com_9f61f923c5ba287050bd2a3e9fe248c4','Acquisition Dept.',NULL,'active','Company''s internal acquisition committee','2022-01-01',1,'lab_e47d9c3ba50cf3d0433c756d88232fdd',NULL,1778605876,1778605876);
	`doc_id` text PRIMARY KEY NOT NULL,
	`doc_title` text NOT NULL,
	`doc_type` text,
	`description` text,
	`upload_date` text,
	`attachment` text,
	`confidential` integer,
	`tags` text,
	`committee_id` text,
	`client_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON UPDATE no action ON DELETE no action
);
	`employee_id` text NOT NULL,
	`lab_id` text NOT NULL,
	`joined_at` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lab_id`) REFERENCES `labs`(`lab_id`) ON UPDATE no action ON DELETE no action
);
	`employee_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slack_id` text,
	`airtable_user_id` text,
	`department` text,
	`role` text,
	`employment_status` text,
	`hire_date` text,
	`base_salary` real,
	`efficiency_score` real,
	`profile_photo` text,
	`sector_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
, `email` text, `phone` text);
INSERT INTO "employees" ("employee_id","name","slack_id","airtable_user_id","department","role","employment_status","hire_date","base_salary","efficiency_score","profile_photo","sector_id","created_at","updated_at","email","phone") VALUES('emp_3dda152e0b8bcbce60d446c4edaa2ebf','Saad Naik','U0740CQC8Q6',NULL,'HR,Finance,Tech,Legal,Ops,Acquisition','CEO','active','2022-01-01',0,90,'/api/assets/download/avatars/usr_95fbbea2c6df18c4cb8b7dfaf540089c_1779601248991.jpg',NULL,1778475070,1779601249,'saadnaik@icloud.com','+923184458194');
INSERT INTO "employees" ("employee_id","name","slack_id","airtable_user_id","department","role","employment_status","hire_date","base_salary","efficiency_score","profile_photo","sector_id","created_at","updated_at","email","phone") VALUES('emp_3e4ef151184bcccc5e29907150797080','test','U0B5W563XGR',NULL,'Tech',NULL,'active','',0,0,NULL,'',1779603606,1779603606,NULL,NULL);
	`lab_id` text PRIMARY KEY NOT NULL,
	`lab_name` text NOT NULL,
	`category` text,
	`description` text,
	`status` text,
	`ops_lead_id` text,
	`lab_photo` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ops_lead_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO "labs" ("lab_id","lab_name","category","description","status","ops_lead_id","lab_photo","created_at","updated_at") VALUES('lab_20ca62803e40284a851bc6500cd818d3','Tech Lab','development',NULL,'active',NULL,NULL,1778486292,1778603851);
INSERT INTO "labs" ("lab_id","lab_name","category","description","status","ops_lead_id","lab_photo","created_at","updated_at") VALUES('lab_e47d9c3ba50cf3d0433c756d88232fdd','Acquisition Lab','innovation','Internal Lab','active',NULL,NULL,1778511536,1778603819);
	`report_id` text PRIMARY KEY NOT NULL,
	`report_name` text NOT NULL,
	`report_month` text,
	`committee_id` text,
	`finance_clearance` integer,
	`hr_clearance` integer,
	`legal_clearance` integer,
	`ops_clearance` integer,
	`ops_final_approval` integer,
	`finance_notes` text,
	`hr_notes` text,
	`legal_notes` text,
	`ops_notes` text,
	`report_doc` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
	`appointment_id` text PRIMARY KEY NOT NULL,
	`role_or_title` text,
	`appointment_date` text,
	`term_type` text,
	`appointment_end_date` text,
	`is_active` integer,
	`employee_id` text,
	`committee_id` text,
	`created_at` integer NOT NULL, account_id text REFERENCES users_logins(id),
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO "appointments" ("appointment_id","role_or_title","appointment_date","term_type","appointment_end_date","is_active","employee_id","committee_id","created_at","account_id") VALUES('appt_24fbd2610f293bb526a269012fc99807','Project Manager - Faayy Shop','2026-05-11','permanent',NULL,1,'emp_3dda152e0b8bcbce60d446c4edaa2ebf','com_4760192638b3b729601a9d626caf80e6',1778499700,'usr_95fbbea2c6df18c4cb8b7dfaf540089c');
INSERT INTO "appointments" ("appointment_id","role_or_title","appointment_date","term_type","appointment_end_date","is_active","employee_id","committee_id","created_at","account_id") VALUES('appt_3d5a595fc6be6cb7e42a8f90c7fd02c3','CEO','2022-01-01','permanent',NULL,1,'emp_3dda152e0b8bcbce60d446c4edaa2ebf','com_f58071c82c4b30994121ace0eba2548c',1778778689,'usr_95fbbea2c6df18c4cb8b7dfaf540089c');
INSERT INTO "appointments" ("appointment_id","role_or_title","appointment_date","term_type","appointment_end_date","is_active","employee_id","committee_id","created_at","account_id") VALUES('appt_0297619b449f8f0f0716b4d90755068d','test','2026-05-24','permanent',NULL,1,'emp_3e4ef151184bcccc5e29907150797080',NULL,1779620652,'usr_22f5b2d7f89240a1e4dfb3190d725da6');
	`tracker_id` text PRIMARY KEY NOT NULL,
	`contract_type` text,
	`legal_status` text,
	`contract_date` text,
	`expiry_date` text,
	`contract_age_days` integer,
	`is_overdue` integer,
	`contract_photo` text,
	`employee_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
	`payroll_id` text PRIMARY KEY NOT NULL,
	`payroll_month` text,
	`gross_salary` real,
	`withholding_tax` real,
	`other_deductions` real,
	`bonuses` real,
	`net_pay` real,
	`raise_amount` real,
	`disbursement_status` text,
	`payment_date` text,
	`finance_reference` text,
	`employee_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
	`sector_id` text PRIMARY KEY NOT NULL,
	`sector_name` text NOT NULL,
	`sector_type` text,
	`budget_amount` real,
	`head_employee_id` text,
	`sector_photo` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`head_employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
	`account_id` text PRIMARY KEY NOT NULL,
	`account_name` text NOT NULL,
	`account_type` text,
	`bank_name` text,
	`account_number` text,
	`opening_balance` real,
	`current_balance` real,
	`currency` text,
	`status` text,
	`created_at` integer NOT NULL
);
	`channel_id` text PRIMARY KEY NOT NULL,
	`channel_name` text NOT NULL,
	`channel_type` text,
	`active_status` integer,
	`last_used_date` text,
	`created_at` integer NOT NULL
);
	`fund_request_id` text PRIMARY KEY NOT NULL,
	`request_name` text NOT NULL,
	`request_date` text,
	`amount_requested` real,
	`purpose` text,
	`approval_status` text,
	`approved_by` text,
	`approval_date` text,
	`disbursement_status` text,
	`disbursement_date` text,
	`committee_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
	`invoice_id` text PRIMARY KEY NOT NULL,
	`invoice_number` text NOT NULL,
	`issue_date` text,
	`due_date` text,
	`amount` real,
	`status` text,
	`type` text,
	`vendor_name` text,
	`description` text,
	`client_id` text,
	`committee_id` text,
	`fund_request_id` text,
	`created_at` integer NOT NULL, invoice_doc TEXT,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fund_request_id`) REFERENCES `fund_requests`(`fund_request_id`) ON UPDATE no action ON DELETE no action
);
	`report_id` text PRIMARY KEY NOT NULL,
	`report_no` text NOT NULL,
	`period` text,
	`period_start` text,
	`period_end` text,
	`total_income` real,
	`total_expenses` real,
	`total_salary` real,
	`other_capital_inputs` real,
	`drawings` real,
	`tax` real,
	`gross_profit` real,
	`net_profit` real,
	`pl_notes` text,
	`pdf_attachment` text,
	`created_at` integer NOT NULL
);
	`transaction_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`transaction_date` text,
	`amount` real,
	`transaction_type` text,
	`description` text,
	`approved` integer,
	`created_by` text,
	`committee_id` text,
	`client_id` text,
	`account_id` text,
	`channel_id` text,
	`invoice_id` text,
	`fund_request_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`account_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`channel_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`invoice_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fund_request_id`) REFERENCES `fund_requests`(`fund_request_id`) ON UPDATE no action ON DELETE no action
);
	`agreement_id` text PRIMARY KEY NOT NULL,
	`agreement_name` text NOT NULL,
	`contract_type` text,
	`effective_date` text,
	`expiry_date` text,
	`auto_renewal` integer,
	`payment_terms` text,
	`status` text,
	`signed_doc` text,
	`committee_id` text,
	`template_id` text,
	`created_at` integer NOT NULL, client_id TEXT,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `legal_templates`(`template_id`) ON UPDATE no action ON DELETE no action
);
	`agreement_id` text NOT NULL,
	`party_id` text NOT NULL,
	`party_role` text,
	FOREIGN KEY (`agreement_id`) REFERENCES `active_agreements`(`agreement_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties_stakeholders`(`party_id`) ON UPDATE no action ON DELETE no action
);
	`obligation_id` text PRIMARY KEY NOT NULL,
	`obligation_name` text NOT NULL,
	`applies_to` text,
	`due_date` text,
	`status` text,
	`assigned_officer` text,
	`jurisdiction` text,
	`supporting_doc` text,
	`agreement_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agreement_id`) REFERENCES `active_agreements`(`agreement_id`) ON UPDATE no action ON DELETE no action
);
	`ip_id` text PRIMARY KEY NOT NULL,
	`asset_name` text NOT NULL,
	`ip_type` text,
	`registered_owner` text,
	`registration_number` text,
	`jurisdiction` text,
	`filing_date` text,
	`expiry_date` text,
	`status` text,
	`supporting_docs` text,
	`party_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`party_id`) REFERENCES `parties_stakeholders`(`party_id`) ON UPDATE no action ON DELETE no action
);
	`request_id` text PRIMARY KEY NOT NULL,
	`request_title` text NOT NULL,
	`category` text,
	`priority` text,
	`status` text,
	`assigned_member` text,
	`date_submitted` text,
	`resolution_notes` text,
	`committee_id` text,
	`party_id` text,
	`agreement_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties_stakeholders`(`party_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agreement_id`) REFERENCES `active_agreements`(`agreement_id`) ON UPDATE no action ON DELETE no action
);
	`sop_id` text PRIMARY KEY NOT NULL,
	`sop_title` text NOT NULL,
	`applicable_dept` text,
	`policy_type` text,
	`effective_date` text,
	`last_reviewed` text,
	`owner` text,
	`approval_status` text,
	`doc_attachment` text,
	`created_at` integer NOT NULL
);
	`template_id` text PRIMARY KEY NOT NULL,
	`document_name` text NOT NULL,
	`version_number` text,
	`jurisdiction` text,
	`last_updated` text,
	`approved_by` text,
	`template_file` text,
	`is_latest` integer,
	`created_at` integer NOT NULL
);
INSERT INTO "legal_templates" ("template_id","document_name","version_number","jurisdiction","last_updated","approved_by","template_file","is_latest","created_at") VALUES('tmpl_02e2dca40fa4ce10bfe8cb3f04834392','MSA','1',NULL,NULL,'Saad NAIK','/api/assets/download/new_template/1779037665623_MSA.pdf',1,1779037769);
INSERT INTO "legal_templates" ("template_id","document_name","version_number","jurisdiction","last_updated","approved_by","template_file","is_latest","created_at") VALUES('tmpl_cf35ca45ed3e5cb9828cc91fd1e37006','DPA','1',NULL,NULL,'Saad Naik','/api/assets/download/new_template/1779037800114_DPA.pdf',1,1779037829);
INSERT INTO "legal_templates" ("template_id","document_name","version_number","jurisdiction","last_updated","approved_by","template_file","is_latest","created_at") VALUES('tmpl_6a2c0c21b05505908bc70dbe04a95e5b','NDA','1',NULL,NULL,'Saad Naik','/api/assets/download/new_template/1779037854511_NDA.pdf',1,1779038098);
INSERT INTO "legal_templates" ("template_id","document_name","version_number","jurisdiction","last_updated","approved_by","template_file","is_latest","created_at") VALUES('tmpl_396ed215bea20159597f86f637aebd4e','SoW','1',NULL,NULL,'Saad Naik','/api/assets/download/new_template/1779038123814_Statement of Work.pdf',1,1779038159);
INSERT INTO "legal_templates" ("template_id","document_name","version_number","jurisdiction","last_updated","approved_by","template_file","is_latest","created_at") VALUES('tmpl_f68d125f9f9b61ca01b2d907d49d996a','SLA','1',NULL,NULL,'Saad Naik','/api/assets/download/new_template/1779038177939_SLA.pdf',1,1779038278);
	`party_id` text PRIMARY KEY NOT NULL,
	`entity_name` text NOT NULL,
	`type` text,
	`contact_information` text,
	`risk_status` text,
	`jurisdiction` text,
	`party_photo` text,
	`created_at` integer NOT NULL
);
	`deployment_id` text PRIMARY KEY NOT NULL,
	`deployment_name` text NOT NULL,
	`deployment_status` text,
	`initiated_by` text,
	`start_time` integer,
	`end_time` integer,
	`ci_cd_result` text,
	`rollback_available` integer,
	`logs` text,
	`project_id` text,
	`env_id` text,
	`release_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`env_id`) REFERENCES `environments`(`env_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`release_id`) ON UPDATE no action ON DELETE no action
);
	`env_id` text PRIMARY KEY NOT NULL,
	`env_name` text NOT NULL,
	`env_type` text,
	`status` text,
	`uptime_pct` real,
	`error_rate_pct` real,
	`avg_latency_ms` real,
	`monthly_cost` real,
	`created_at` integer NOT NULL
);
	`epic_id` text PRIMARY KEY NOT NULL,
	`epic_name` text NOT NULL,
	`description` text,
	`status` text,
	`priority` text,
	`start_date` text,
	`target_end_date` text,
	`owner` text,
	`project_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON UPDATE no action ON DELETE no action
);
	`issue_id` text PRIMARY KEY NOT NULL,
	`issue_title` text NOT NULL,
	`description` text,
	`severity` text,
	`status` text,
	`sla_target_date` text,
	`reported_date` text,
	`resolved_date` text,
	`assigned_to` text,
	`project_id` text,
	`story_id` text,
	`env_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`story_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`env_id`) REFERENCES `environments`(`env_id`) ON UPDATE no action ON DELETE no action
);
	`project_id` text PRIMARY KEY NOT NULL,
	`project_name` text NOT NULL,
	`description` text,
	`start_date` text,
	`end_date` text,
	`status` text,
	`priority` text,
	`budget` real,
	`client_name` text,
	`committee_id` text,
	`owner` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
	`release_id` text PRIMARY KEY NOT NULL,
	`release_name` text NOT NULL,
	`version` text,
	`release_date` text,
	`status` text,
	`ci_cd_result` text,
	`release_notes` text,
	`release_owner` text,
	`project_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON UPDATE no action ON DELETE no action
);
	`story_id` text PRIMARY KEY NOT NULL,
	`story_title` text NOT NULL,
	`description` text,
	`status` text,
	`story_points` integer,
	`priority` text,
	`acceptance_criteria` text,
	`tags` text,
	`due_date` text,
	`epic_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`epic_id`) ON UPDATE no action ON DELETE no action
);
	`task_id` text PRIMARY KEY NOT NULL,
	`task_name` text NOT NULL,
	`description` text,
	`priority` text,
	`due_date` text,
	`assignee` text,
	`airtable_user_id` text,
	`status` text,
	`estimated_effort` real,
	`actual_effort` real,
	`sprint_id` text,
	`campaign_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sprint_id`) REFERENCES `sprints`(`sprint_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`campaign_id`) ON UPDATE no action ON DELETE no action
);
	`campaign_id` text PRIMARY KEY NOT NULL,
	`campaign_name` text NOT NULL,
	`type` text,
	`objective` text,
	`budget` real,
	`start_date` text,
	`end_date` text,
	`leads_generated` integer,
	`roi` real,
	`status` text,
	`created_at` integer NOT NULL
);
	`contact_id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`company_name` text,
	`email` text,
	`phone` text,
	`lead_source` text,
	`pipeline_stage` text,
	`contact_owner` text,
	`lead_score` integer,
	`created_at` integer NOT NULL
);
	`content_id` text PRIMARY KEY NOT NULL,
	`content_title` text NOT NULL,
	`channel` text,
	`owner` text,
	`publish_date` text,
	`status` text,
	`engagement` integer,
	`views` integer,
	`click_through_rate` real,
	`campaign_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`campaign_id`) ON UPDATE no action ON DELETE no action
);
	`funnel_id` text PRIMARY KEY NOT NULL,
	`funnel_name` text NOT NULL,
	`conversion_rate_pct` real,
	`stages` text,
	`lead_entry_count` integer,
	`conversions` integer,
	`campaign_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`campaign_id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO "funnels_pipelines" ("funnel_id","funnel_name","conversion_rate_pct","stages","lead_entry_count","conversions","campaign_id","created_at") VALUES('fun_7e3b1126acf82fdfab1bb65b6b03102a','Lead Generation Funnel',NULL,'[{"name":"Awareness","value":230},{"name":"Contact","value":25},{"name":"Conversion","value":12}]',230,12,NULL,1778784433);
	`activity_id` text PRIMARY KEY NOT NULL,
	`activity_type` text,
	`timestamp` integer,
	`notes` text,
	`automation_trigger` integer,
	`contact_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts_leads`(`contact_id`) ON UPDATE no action ON DELETE no action
);
	`sprint_id` text PRIMARY KEY NOT NULL,
	`sprint_name` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`sprint_goals` text,
	`status` text,
	`created_at` integer NOT NULL
);
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0000_plain_shard.sql','2026-05-11 17:44:20');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(2,'0001_curved_donald_blake.sql','2026-05-11 17:48:03');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(3,'0002_silly_bug.sql','2026-05-11 17:49:58');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(4,'0003_lame_bucky.sql','2026-05-11 17:49:58');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(5,'0004_tidy_lockjaw.sql','2026-05-11 17:51:35');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(6,'0005_add_can_create_tasks.sql','2026-05-11 18:00:36');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(7,'0006_add_appointment_id_to_tasks.sql','2026-05-11 18:02:27');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(8,'0007_granular_permissions.sql','2026-05-11 18:02:27');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(9,'0008_crm_notifications_tasks.sql','2026-05-11 18:02:27');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(34,'0009_lame_bucky copy.sql','2026-05-11 18:46:34');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(35,'0010_fix_universal_tasks_schema.sql','2026-05-11 18:53:41');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(36,'0005_late_warbound.sql','2026-05-22 12:55:38');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(37,'0006_black_joseph.sql','2026-05-22 12:55:38');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(38,'0007_serious_mongoose.sql','2026-05-22 12:55:38');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(39,'0008_bitter_puppet_master.sql','2026-05-22 12:55:38');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(40,'0009_fast_venom.sql','2026-05-22 12:55:38');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(41,'0010_useful_thunderbolt_ross.sql','2026-05-22 12:55:38');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(42,'fix_universal_tasks_fk.sql','2026-05-22 12:55:38');
INSERT INTO "role_hierarchy" ("role_id","level","can_provision_role_ids","allowed_modules","created_at") VALUES('role_ceo',1,'["role_ceo","role_hr","role_finance","role_legal","role_tech","role_acq","role_emp","role_agent"]','["hr","finance","legal","ops","acquisition","tech","mcp_server"]',1778429123);
INSERT INTO "role_hierarchy" ("role_id","level","can_provision_role_ids","allowed_modules","created_at") VALUES('role_hr',2,'["role_finance","role_legal","role_tech","role_acq","role_emp"]','["hr","ops","mcp_server"]',1778429123);
INSERT INTO "role_hierarchy" ("role_id","level","can_provision_role_ids","allowed_modules","created_at") VALUES('role_finance',3,'[]','["finance","ops","mcp_server"]',1778429123);
INSERT INTO "role_hierarchy" ("role_id","level","can_provision_role_ids","allowed_modules","created_at") VALUES('role_legal',3,'[]','["legal","ops","mcp_server"]',1778429123);
INSERT INTO "role_hierarchy" ("role_id","level","can_provision_role_ids","allowed_modules","created_at") VALUES('role_tech',3,'[]','["tech","ops","mcp_server"]',1778429123);
INSERT INTO "role_hierarchy" ("role_id","level","can_provision_role_ids","allowed_modules","created_at") VALUES('role_acq',3,'[]','["acquisition","mcp_server"]',1778429123);
INSERT INTO "role_hierarchy" ("role_id","level","can_provision_role_ids","allowed_modules","created_at") VALUES('role_emp',4,'[]','[]',1778429123);
INSERT INTO "role_hierarchy" ("role_id","level","can_provision_role_ids","allowed_modules","created_at") VALUES('role_agent',3,'[]','["mcp_server"]',1778429123);
INSERT INTO "user_ownership" ("user_id","owner_user_id","assigned_at","assigned_by_user_id") VALUES('usr_95fbbea2c6df18c4cb8b7dfaf540089c','user_ceo-001',1778488861,'user_ceo-001');
INSERT INTO "user_ownership" ("user_id","owner_user_id","assigned_at","assigned_by_user_id") VALUES('usr_9b72d0b17220fa994e1ccb93d05413bc','user_ceo-001',1778500074,'user_ceo-001');
INSERT INTO "user_ownership" ("user_id","owner_user_id","assigned_at","assigned_by_user_id") VALUES('usr_22f5b2d7f89240a1e4dfb3190d725da6','usr_95fbbea2c6df18c4cb8b7dfaf540089c',1779620652,'usr_95fbbea2c6df18c4cb8b7dfaf540089c');
INSERT INTO "user_app_access" ("id","user_id","app_name","access_level","created_at","can_create_tasks") VALUES('uaa_c8ef6e83d5bbca573c28d08daf455569','usr_95fbbea2c6df18c4cb8b7dfaf540089c','tech','employee',1778488861,1);
INSERT INTO "user_app_access" ("id","user_id","app_name","access_level","created_at","can_create_tasks") VALUES('uaa_376b1378deab470e17b1917846eea29c','usr_95fbbea2c6df18c4cb8b7dfaf540089c','crm','employee',1778488861,1);
INSERT INTO "user_app_access" ("id","user_id","app_name","access_level","created_at","can_create_tasks") VALUES('uaa_388499c1c0ef47620b09c06dd5986494','usr_95fbbea2c6df18c4cb8b7dfaf540089c','dashboard','employee',1778488861,1);
INSERT INTO "user_app_access" ("id","user_id","app_name","access_level","created_at","can_create_tasks") VALUES('uaa_bd6234e8d528e000c91e0eaaac7bf42b','usr_9b72d0b17220fa994e1ccb93d05413bc','dashboard','employee',1778500075,1);
INSERT INTO "user_app_access" ("id","user_id","app_name","access_level","created_at","can_create_tasks") VALUES('acc_ceo_hr','user-ceo-new','hr','admin',1778509686,1);
INSERT INTO "user_app_access" ("id","user_id","app_name","access_level","created_at","can_create_tasks") VALUES('acc_ceo_finance','user-ceo-new','finance','admin',1778509686,1);
INSERT INTO "user_app_access" ("id","user_id","app_name","access_level","created_at","can_create_tasks") VALUES('acc_ceo_legal','user-ceo-new','legal','admin',1778509686,1);
INSERT INTO "user_app_access" ("id","user_id","app_name","access_level","created_at","can_create_tasks") VALUES('acc_ceo_ops','user-ceo-new','ops','admin',1778509686,1);
INSERT INTO "user_app_access" ("id","user_id","app_name","access_level","created_at","can_create_tasks") VALUES('acc_ceo_acq','user-ceo-new','acquisition','admin',1778509686,1);
INSERT INTO "user_app_access" ("id","user_id","app_name","access_level","created_at","can_create_tasks") VALUES('acc_ceo_tech','user-ceo-new','tech','admin',1778509686,1);
INSERT INTO "user_app_access" ("id","user_id","app_name","access_level","created_at","can_create_tasks") VALUES('acc_hr_hr','user-hr-new','hr','admin',1778509686,1);
INSERT INTO "user_app_access" ("id","user_id","app_name","access_level","created_at","can_create_tasks") VALUES('acc_hr_ops','user-hr-new','ops','admin',1778509686,1);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('p_hr_hr_appointments','user-hr-new','hr','appointments',1,1,1,1778509686,1778509686);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('p_hr_hr_employees','user-hr-new','hr','employees',1,1,1,1778509686,1778509686);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('p_hr_hr_payroll','user-hr-new','hr','payroll',1,1,1,1778509686,1778509686);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('p_hr_hr_resets','user-hr-new','hr','resets',1,1,1,1778509686,1778509686);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('p_hr_hr_tasks','user-hr-new','hr','tasks',1,1,1,1778509686,1778509686);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('p_hr_ops_clients','user-hr-new','ops','clients',1,1,1,1778509686,1778509686);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('p_hr_ops_committees','user-hr-new','ops','committees',1,1,1,1778509686,1778509686);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('p_hr_ops_docs','user-hr-new','ops','docs',1,1,1,1778509686,1778509686);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('p_hr_ops_labs','user-hr-new','ops','labs',1,1,1,1778509686,1778509686);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('p_hr_ops_tasks','user-hr-new','ops','tasks',1,1,1,1778509686,1778509686);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_352d3f5d5aae0fb1626971fb3be4492a','usr_9b72d0b17220fa994e1ccb93d05413bc','dashboard','overview',1,1,1,1778511705,1778511705);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_8bee271a4ec4afe4ba4ae7b03c9e8ae9','usr_9b72d0b17220fa994e1ccb93d05413bc','dashboard','notes',1,1,1,1778511705,1778511705);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_f6b59932b594d19aec1372364a2e5ff8','usr_9b72d0b17220fa994e1ccb93d05413bc','tech','projects',1,1,1,1778511705,1778511705);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_9fdfcd499ef79f665da862e13ac11533','usr_9b72d0b17220fa994e1ccb93d05413bc','tech','issues',1,1,1,1778511705,1778511705);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_17e97c13cc4f9f0fc84ce3eed43cc7ff','usr_9b72d0b17220fa994e1ccb93d05413bc','tech','deployments',1,1,1,1778511705,1778511705);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_0974fbef88e6d2b5b575e07ad9381ffc','usr_9b72d0b17220fa994e1ccb93d05413bc','tech','tasks',1,1,1,1778511705,1778511705);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_00daeeafcde596c4eaed13c8f9db70bd','usr_9b72d0b17220fa994e1ccb93d05413bc','crm','tickets',1,1,0,1778511705,1778511705);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_3f39ba4b1e2f8cb67d6943d435ab9d9f','usr_9b72d0b17220fa994e1ccb93d05413bc','crm','documents',1,1,0,1778511705,1778511705);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_e036076dd05e98508c55fee402b7fa3f','usr_9b72d0b17220fa994e1ccb93d05413bc','crm','planner',1,1,0,1778511705,1778511705);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_50ae8acafd54d3df0f16880f38793feb','usr_9b72d0b17220fa994e1ccb93d05413bc','crm','tasks',1,1,0,1778511705,1778511705);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_fde38b00ef94df19236900c56d4ba56e','user-ceo-new','crm','tickets',1,0,0,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_5426562f652b5ee31c65910852a76898','user-ceo-new','crm','tasks',1,0,0,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_f46d44ac197c4de96d98cc876254c901','user-ceo-new','crm','documents',1,0,0,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_246af22616acf6fe2ac57bf2f56e40c9','user-ceo-new','crm','planner',1,0,0,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_a02d597bacaa18e1ef4ad7d3f2703614','user-ceo-new','dashboard','overview',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_7df77f6a1f8ca76b527c0a61ebbfdf9e','user-ceo-new','dashboard','notes',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_7b8ce5bb8ec7e1d7ad8663b8faad3cb6','user-ceo-new','hr','employees',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_10c34303cd9f9f42049cbd95f063384e','user-ceo-new','hr','appointments',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_e6049d05643a0fe98a4b03e9cff00c42','user-ceo-new','hr','payroll',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_55ca651032d6b4c7fbee2032ff621b82','user-ceo-new','hr','resets',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_50beb50679cfd5592a4f9986251fc516','user-ceo-new','hr','tasks',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_8ccb2c68d183956b7f68a06245a0069a','user-ceo-new','finance','transactions',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_0a64d7ba5fabfbf26c50f28504d34ba4','user-ceo-new','finance','invoices',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_6d32693437ba535f433f9617bb036564','user-ceo-new','finance','fund_requests',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_9d43f28d028539eac2e47e4ffb3a2bc5','user-ceo-new','finance','accounts',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_0980df98503a8d97d59f01bfed4e6037','user-ceo-new','finance','tasks',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_3d9c46594916558f4ae38f4843823172','user-ceo-new','legal','agreements',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_83d05a08dea5d14c2955601e8a36d0db','user-ceo-new','legal','templates',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_f7f9d0f24ad170142f9f0f38bc574130','user-ceo-new','legal','compliance',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_717df4d1e7d79ef43ae3d5a65e6fcd18','user-ceo-new','legal','ip',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_be6bb2774e48b80cd2faf938ba5e0b9c','user-ceo-new','legal','tasks',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_19025c5afbc1cf2d5893fa8c018a2df0','user-ceo-new','tech','projects',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_2ae1c3994b53952f1c10132741f00323','user-ceo-new','tech','issues',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_85d6876955dcd28312a37d7aa90eed92','user-ceo-new','tech','deployments',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_59257469a78044a1e1e04f4e99ade76d','user-ceo-new','tech','tasks',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_549f9c2b75c2a36def6a495871323bec','user-ceo-new','acquisition','campaigns',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_f852192fb183f1dada0aa7d36625567e','user-ceo-new','acquisition','contacts',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_503332db7e4f2c6e6e4b5ac0262e6676','user-ceo-new','acquisition','content',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_a7891135ec860d42d70d16c65379e613','user-ceo-new','acquisition','sprints',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_91c26f71ed71ce63eb7ecfc312b0a9b5','user-ceo-new','acquisition','tasks',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_782eab301d6ce35b39e3bddfa890673b','user-ceo-new','ops','labs',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_8bf4b198009f04952f4a4983b4538e2b','user-ceo-new','ops','committees',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_5ffa709200ec5ac4b658b6c48b1305f9','user-ceo-new','ops','clients',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_76659cf88a7e94cff6366c540fd47617','user-ceo-new','ops','docs',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_ad174dc51f8f35961cf8f2d16a27f788','user-ceo-new','ops','tasks',1,1,1,1778512288,1778512288);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_b9dac1c199616d01936e5db059a9842e','usr_95fbbea2c6df18c4cb8b7dfaf540089c','hr','employees',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_d52aabd345b2bde874cd1b5609d01685','usr_95fbbea2c6df18c4cb8b7dfaf540089c','hr','appointments',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_b268ab23f92c659e4b498f8effbf662f','usr_95fbbea2c6df18c4cb8b7dfaf540089c','hr','payroll',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_6d7b46cad07966b3e96239867d693c69','usr_95fbbea2c6df18c4cb8b7dfaf540089c','hr','resets',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_ea09d750d66be375ed921e2323894eb1','usr_95fbbea2c6df18c4cb8b7dfaf540089c','hr','tasks',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_5012e3a17b3d90141c97b1032e5ab1fc','usr_95fbbea2c6df18c4cb8b7dfaf540089c','finance','transactions',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_5a1faa31a61e16fd9551d85c360ff828','usr_95fbbea2c6df18c4cb8b7dfaf540089c','finance','invoices',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_37a8c11f877d29dff32ca9605186a93c','usr_95fbbea2c6df18c4cb8b7dfaf540089c','finance','fund_requests',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_92fa28c91a81a964da5820300581d3bf','usr_95fbbea2c6df18c4cb8b7dfaf540089c','finance','accounts',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_92432d0d2ea5b1d7d2938d3642097de4','usr_95fbbea2c6df18c4cb8b7dfaf540089c','finance','tasks',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_5a4c6b2e11b918dec214741e0424983c','usr_95fbbea2c6df18c4cb8b7dfaf540089c','legal','agreements',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_85fea2dcfe0f2c39920b1253bd80c33f','usr_95fbbea2c6df18c4cb8b7dfaf540089c','legal','templates',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_f0a0b32136bfb9d88403a50bf1266480','usr_95fbbea2c6df18c4cb8b7dfaf540089c','legal','compliance',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_f94762de1c9993a4db9e825c41912d65','usr_95fbbea2c6df18c4cb8b7dfaf540089c','legal','ip',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_33f29d7b81f7e7a2a2969289bae9c659','usr_95fbbea2c6df18c4cb8b7dfaf540089c','legal','tasks',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_b82fd97de266e84bcac0af984f5e7dce','usr_95fbbea2c6df18c4cb8b7dfaf540089c','tech','projects',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_d6ad1f405588306f0d298746d751142b','usr_95fbbea2c6df18c4cb8b7dfaf540089c','tech','issues',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_e69fcd9d2a80a5b0964b2d77942d0617','usr_95fbbea2c6df18c4cb8b7dfaf540089c','tech','deployments',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_69b62e66ab40ad343675b3ba4fce598a','usr_95fbbea2c6df18c4cb8b7dfaf540089c','tech','tasks',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_23cfabdeaf25f669312f974230b18284','usr_95fbbea2c6df18c4cb8b7dfaf540089c','acquisition','campaigns',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_d5dffaa73867c563967700349babb70c','usr_95fbbea2c6df18c4cb8b7dfaf540089c','acquisition','contacts',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_897eaa6305485eaa9cf28ef43f943982','usr_95fbbea2c6df18c4cb8b7dfaf540089c','acquisition','content',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_3db559dd6dae2b9864f87eb1aac8697d','usr_95fbbea2c6df18c4cb8b7dfaf540089c','acquisition','sprints',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_305e0e5d7d3950b2312b7f9d9d5c0323','usr_95fbbea2c6df18c4cb8b7dfaf540089c','acquisition','tasks',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_e5c11c3480c654636770b20d5dde0fa9','usr_95fbbea2c6df18c4cb8b7dfaf540089c','dashboard','overview',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_0bac2392315efc7eb7367cc029a15ff5','usr_95fbbea2c6df18c4cb8b7dfaf540089c','dashboard','notes',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_22fe34794b7c42d2a2015b5978b11a62','usr_95fbbea2c6df18c4cb8b7dfaf540089c','crm','tickets',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_f0f09774c9f55febf111e0145ec11b6a','usr_95fbbea2c6df18c4cb8b7dfaf540089c','crm','documents',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_c67fff15943fb5e48f080add27249404','usr_95fbbea2c6df18c4cb8b7dfaf540089c','crm','planner',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_56fb5f5aad411b1261c0bc012a863fcb','usr_95fbbea2c6df18c4cb8b7dfaf540089c','crm','tasks',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_fddaa51efb05ff3ed9725328cda4e986','usr_95fbbea2c6df18c4cb8b7dfaf540089c','ops','labs',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_531160d3776214960d638597368365d6','usr_95fbbea2c6df18c4cb8b7dfaf540089c','ops','committees',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_eb427093e7afcf829453f5777d12c8db','usr_95fbbea2c6df18c4cb8b7dfaf540089c','ops','clients',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_8271f364f1946bdfaa2284dfa980a468','usr_95fbbea2c6df18c4cb8b7dfaf540089c','ops','docs',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_d4db44c9030f8f5b30064f14c486901a','usr_95fbbea2c6df18c4cb8b7dfaf540089c','ops','tasks',1,1,1,1778778716,1778778716);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_337a5d4ada35da8c8e28852c97781fb6','usr_22f5b2d7f89240a1e4dfb3190d725da6','dashboard','overview',1,1,1,1779620854,1779620854);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_da50235c057d3946db80ca200ea83b60','usr_22f5b2d7f89240a1e4dfb3190d725da6','dashboard','notes',1,1,1,1779620854,1779620854);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_7c6d4f185c52f242d1c23a7e09fe3d5e','usr_22f5b2d7f89240a1e4dfb3190d725da6','tech','projects',1,1,0,1779620854,1779620854);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_7c25894d6548bcdd742ca00a08646928','usr_22f5b2d7f89240a1e4dfb3190d725da6','tech','issues',1,1,0,1779620854,1779620854);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_6eaf1de28afa0a2f7fe4e11899cb4271','usr_22f5b2d7f89240a1e4dfb3190d725da6','tech','deployments',1,1,0,1779620854,1779620854);
INSERT INTO "user_app_permissions" ("id","user_id","app_name","feature","can_view","can_edit","can_delete","created_at","updated_at") VALUES('perm_6bc6af286f6ba158cbc675ff6b1ec10d','usr_22f5b2d7f89240a1e4dfb3190d725da6','tech','tasks',1,1,0,1779620854,1779620854);
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text,
	`is_active` integer DEFAULT 1,
	`last_login_at` integer,
	`failed_attempts` integer DEFAULT 0,
	`locked_until` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO "client_logins" ("id","client_id","email","password_hash","name","is_active","last_login_at","failed_attempts","locked_until","created_at") VALUES('clog_10b48d762120a303025f1a7e0361b85d','client_105a7426d5313a9e84f32d69b4c20ab4','faayy@godwinausten.org','b851a97e7fd4d1700d62fcdc74a171716855c29aaeb2133b9530bfc10eac4e56','Faayy Shop',1,1778560502,0,NULL,1778514708);
	`ticket_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text NOT NULL,
	`priority` text,
	`category` text,
	`raised_by_type` text,
	`raised_by_id` text,
	`assigned_to` text,
	`committee_id` text NOT NULL,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`assigned_to`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
	`doc_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`doc_type` text,
	`r2_key` text NOT NULL,
	`r2_bucket` text,
	`file_size` integer,
	`mime_type` text,
	`uploaded_by_id` text,
	`committee_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO "crm_documents" ("doc_id","title","doc_type","r2_key","r2_bucket","file_size","mime_type","uploaded_by_id","committee_id","created_at") VALUES('cdoc_38968ead1b560e2ef65ec5a1a8bb344a','Faayy Logo','other','/api/assets/download/upload_institutional_asset/1778561860819_Red Modern Lettering Creative Studio Logo.png',NULL,NULL,NULL,'user-ceo-new','com_4760192638b3b729601a9d626caf80e6',1778561865);
	`event_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`event_type` text,
	`start_date` text,
	`end_date` text,
	`all_day` integer,
	`committee_id` text NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
	`user_id` text PRIMARY KEY NOT NULL,
	`preferences` text,
	`last_accessed` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO "user_dashboard_state" ("user_id","preferences","last_accessed","created_at","updated_at") VALUES('user-ceo-new',NULL,1778778417,1778515813,1778778417);
INSERT INTO "user_dashboard_state" ("user_id","preferences","last_accessed","created_at","updated_at") VALUES('usr_95fbbea2c6df18c4cb8b7dfaf540089c',NULL,1779600090,1778778554,1779600090);
INSERT INTO "user_dashboard_state" ("user_id","preferences","last_accessed","created_at","updated_at") VALUES('usr_22f5b2d7f89240a1e4dfb3190d725da6',NULL,1779620707,1779620707,1779620707);
	`note_id` text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`pinned` integer DEFAULT 0,
	`color` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY ("user_id") REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO "user_notes" ("note_id","user_id","title","content","pinned","color","created_at","updated_at") VALUES('note_93397e22daa1191390497c3f9c21f892','user-ceo-new','Godwin Austen Labs — Pre-Launch & Partnership Master TODO',replace('## 🔴 1. Partnership Structure (DO THIS FIRST)\n\n### 1.1 Define Roles & Responsibilities\n\n* [ ] Clearly define what **Godwin Austen Labs owns**\n  (AI systems, Nova framework, agents, data pipelines, automation logic)\n* [ ] Clearly define what **Partner Agency owns**\n  (UI/UX, branding, client communication, non-AI services)\n* [ ] Define overlap areas\n  (Who handles delivery? Who manages client success?)\n\n---\n\n### 1.2 Revenue Split Model\n\n* [ ] Choose a pricing + split structure:\n\n  * Project-based split (70/30, 50/50 depending on work)\n  * OR layered revenue model (AI vs UI separation)\n* [ ] Define:\n\n  * Who invoices the client\n  * How money flows (single entity vs split billing)\n* [ ] Decide profit distribution timeline\n  (per project / monthly / quarterly)\n\n---\n\n### 1.3 Ownership & IP Protection\n\n* [ ] Confirm **Nova system = 100% owned by Godwin Austen Labs**\n* [ ] Define ownership of:\n\n  * AI agents\n  * Improvements made during projects\n  * Client-specific customizations\n* [ ] Add clause:\n  (Partner cannot reuse or replicate Nova outside agreement)\n\n---\n\n### 1.4 Exit & Risk Management\n\n* [ ] Define exit conditions:\n  (voluntary exit, dispute, inactivity)\n* [ ] Define what happens to:\n\n  * Shared clients\n  * Ongoing projects\n  * Revenue pipelines\n* [ ] Add dispute resolution mechanism\n  (mediation → arbitration → legal)\n\n---\n\n### 1.5 Partnership Agreement Document\n\n* [ ] Draft and sign formal **Partnership Agreement**\n  (this is separate from MSA, MUST be done first)\n\n---\n\n## 🔴 2. Internal Team & Talent System\n\n### 2.1 Contractor / Intern Agreements\n\n* [ ] Create agreement covering:\n\n  * IP assignment (everything built = company owned)\n  * Confidentiality\n  * Payment / stipend terms\n  * Work expectations\n* [ ] Ensure ALL team members sign before starting\n\n---\n\n### 2.2 Talent Pipeline (Your Vision Layer)\n\n* [ ] Define:\n\n  * Internship structure\n  * Training modules (AI, design, systems)\n* [ ] Position as:\n  “Godwin Austen Labs Fellowship Program”\n* [ ] Decide:\n\n  * Paid vs unpaid\n  * Duration\n  * Conversion to full-time\n\n---\n\n### 2.3 Access & Security Control\n\n* [ ] Restrict access to:\n\n  * Nova system core\n  * API keys / infra\n* [ ] Define permission levels:\n  (intern / dev / partner)\n\n---\n\n## 🔴 3. Product & Service Definition\n\n### 3.1 Core Offering (Simplify Messaging)\n\n* [ ] Define clear value proposition:\n  “We help textile companies generate 10x more designs at lower cost”\n* [ ] Avoid technical jargon (agents, frameworks)\n\n---\n\n### 3.2 Service Packages\n\n* [ ] Define 2–3 clear offerings:\n\n  * Design Generation System\n  * Embroidery / Pattern AI\n  * Trend / Research Agent\n* [ ] Define deliverables for each\n\n---\n\n### 3.3 Output Readiness\n\n* [ ] Ensure designs are:\n\n  * Production-ready\n  * Repeatable patterns\n  * Compatible with textile workflows\n* [ ] Validate with real use-case\n\n---\n\n## 🔴 4. Pricing Strategy\n\n### 4.1 Replace/Refine Trojan Horse Model\n\n* [ ] Decide pricing structure:\n\n  * Monthly retainer (recommended)\n  * * performance bonus (optional)\n* [ ] Define baseline pricing tiers\n\n---\n\n### 4.2 Financial Clarity\n\n* [ ] Define:\n\n  * Cost per project\n  * Expected margins\n* [ ] Ensure profitability BEFORE scaling\n\n---\n\n## 🔴 5. Legal Stack (Client-Facing)\n\n### 5.1 Finalize Core Documents\n\n* [ ] Refine and standardize:\n\n  * MSA (Master Service Agreement)\n  * NDA\n  * SOW\n  * SLA\n  * DPA\n\n---\n\n### 5.2 Customize for Textile Industry\n\n* [ ] Add clauses for:\n\n  * Design ownership\n  * Usage rights\n  * Revisions / iterations\n* [ ] Ensure clarity in deliverables\n\n---\n\n### 5.3 Internal Legal Alignment\n\n* [ ] Ensure:\n\n  * All contracts align with partnership agreement\n  * No conflicting clauses\n\n---\n\n## 🔴 6. Client Onboarding System\n\n### 6.1 Sales → Onboarding Flow\n\n* [ ] Define steps:\n\n  * Discovery call\n  * NDA (if needed)\n  * Proposal\n  * MSA + SOW signing\n  * Payment\n  * Kickoff\n\n---\n\n### 6.2 Client Data Collection\n\n* [ ] Create onboarding form for:\n\n  * Design preferences\n  * Fabric types\n  * Target market\n  * Brand style\n\n---\n\n### 6.3 Delivery Workflow\n\n* [ ] Define:\n\n  * How designs are generated\n  * Review cycles\n  * Revision limits\n* [ ] Set expectations clearly\n\n---\n\n### 6.4 Communication System\n\n* [ ] Choose tools:\n  (WhatsApp / Slack / Email)\n* [ ] Define response times\n\n---\n\n## 🔴 7. Pilot Clients (VERY IMPORTANT)\n\n### 7.1 Acquire First 1–2 Clients\n\n* [ ] Target:\n\n  * Small textile exporters\n  * Local manufacturers\n* [ ] Offer:\n\n  * Discounted pilot\n  * High-touch service\n\n---\n\n### 7.2 Build Case Studies\n\n* [ ] Track:\n\n  * Number of designs generated\n  * Cost savings\n  * Speed improvement\n* [ ] Turn into proof for future sales\n\n---\n\n## 🔴 8. Brand & Positioning\n\n### 8.1 External Messaging\n\n* [ ] Position as:\n  “AI-powered textile design partner”\n* [ ] Avoid:\n  (overly technical language)\n\n---\n\n### 8.2 Internal Identity\n\n* [ ] Define:\n\n  * Mission (raise youth capability)\n  * Vision (AI-driven production systems)\n* [ ] Keep separate from client messaging\n\n---\n\n## 🔴 9. Systems & Operations\n\n### 9.1 Project Management\n\n* [ ] Set up:\n  (Notion / Trello / ClickUp)\n* [ ] Track:\n\n  * Tasks\n  * Deliverables\n  * Deadlines\n\n---\n\n### 9.2 Documentation\n\n* [ ] Document:\n\n  * Nova system usage\n  * Agent workflows\n  * Internal SOPs\n\n---\n\n### 9.3 Scaling Readiness\n\n* [ ] Ensure:\n\n  * Repeatable workflows\n  * Minimal dependency on you\n\n---\n\n# ⚠️ Final Rule\n\nDO NOT:\n\n* Start client work before partnership clarity\n* Share core tech without IP protection\n* Scale team without agreements\n\n---\n\n# ✅ Immediate Priority Order\n\n1. Partnership Agreement\n2. Revenue Split Model\n3. IP Protection\n4. First Pilot Client\n5. Refine Pricing\n6. Then Scale\n\n---\n','\n',char(10)),0,NULL,1778777830,1778778195);
INSERT INTO "user_notes" ("note_id","user_id","title","content","pinned","color","created_at","updated_at") VALUES('note_899459b74e03f966b24beee0f41f3fa2','usr_95fbbea2c6df18c4cb8b7dfaf540089c','Pre-Launch & Partnership briefing',replace('## 🔴 1. Partnership Structure (DO THIS FIRST)\n\n### 1.1 Define Roles & Responsibilities\n\n* [ ] Clearly define what **Godwin Austen Labs owns**\n  (AI systems, Nova framework, agents, data pipelines, automation logic)\n* [ ] Clearly define what **Partner Agency owns**\n  (UI/UX, branding, client communication, non-AI services)\n* [ ] Define overlap areas\n  (Who handles delivery? Who manages client success?)\n\n\n\n\n---\n\n### 1.2 Revenue Split Model\n\n* [ ] Choose a pricing + split structure:\n\n  * Project-based split (70/30, 50/50 depending on work)\n  * OR layered revenue model (AI vs UI separation)\n* [ ] Define:\n\n  * Who invoices the client\n  * How money flows (single entity vs split billing)\n* [ ] Decide profit distribution timeline\n  (per project / monthly / quarterly)\n\n---\n\n### 1.3 Ownership & IP Protection\n\n* [ ] Confirm **Nova system = 100% owned by Godwin Austen Labs**\n* [ ] Define ownership of:\n\n  * AI agents\n  * Improvements made during projects\n  * Client-specific customizations\n* [ ] Add clause:\n  (Partner cannot reuse or replicate Nova outside agreement)\n\n---\n\n### 1.4 Exit & Risk Management\n\n* [ ] Define exit conditions:\n  (voluntary exit, dispute, inactivity)\n* [ ] Define what happens to:\n\n  * Shared clients\n  * Ongoing projects\n  * Revenue pipelines\n* [ ] Add dispute resolution mechanism\n  (mediation → arbitration → legal)\n\n---\n\n### 1.5 Partnership Agreement Document\n\n* [ ] Draft and sign formal **Partnership Agreement**\n  (this is separate from MSA, MUST be done first)\n\n---\n\n## 🔴 2. Internal Team & Talent System\n\n### 2.1 Contractor / Intern Agreements\n\n* [ ] Create agreement covering:\n\n  * IP assignment (everything built = company owned)\n  * Confidentiality\n  * Payment / stipend terms\n  * Work expectations\n* [ ] Ensure ALL team members sign before starting\n\n---\n\n### 2.2 Talent Pipeline (Your Vision Layer)\n\n* [ ] Define:\n\n  * Internship structure\n  * Training modules (AI, design, systems)\n* [ ] Position as:\n  “Godwin Austen Labs Fellowship Program”\n* [ ] Decide:\n\n  * Paid vs unpaid\n  * Duration\n  * Conversion to full-time\n\n---\n\n### 2.3 Access & Security Control\n\n* [ ] Restrict access to:\n\n  * Nova system core\n  * API keys / infra\n* [ ] Define permission levels:\n  (intern / dev / partner)\n\n---\n\n## 🔴 3. Product & Service Definition\n\n### 3.1 Core Offering (Simplify Messaging)\n\n* [ ] Define clear value proposition:\n  “We help textile companies generate 10x more designs at lower cost”\n* [ ] Avoid technical jargon (agents, frameworks)\n\n---\n\n### 3.2 Service Packages\n\n* [ ] Define 2–3 clear offerings:\n\n  * Design Generation System\n  * Embroidery / Pattern AI\n  * Trend / Research Agent\n* [ ] Define deliverables for each\n\n---\n\n### 3.3 Output Readiness\n\n* [ ] Ensure designs are:\n\n  * Production-ready\n  * Repeatable patterns\n  * Compatible with textile workflows\n* [ ] Validate with real use-case\n\n---\n\n## 🔴 4. Pricing Strategy\n\n### 4.1 Replace/Refine Trojan Horse Model\n\n* [ ] Decide pricing structure:\n\n  * Monthly retainer (recommended)\n  * * performance bonus (optional)\n* [ ] Define baseline pricing tiers\n\n---\n\n### 4.2 Financial Clarity\n\n* [ ] Define:\n\n  * Cost per project\n  * Expected margins\n* [ ] Ensure profitability BEFORE scaling\n\n---\n\n## 🔴 5. Legal Stack (Client-Facing)\n\n### 5.1 Finalize Core Documents\n\n* [ ] Refine and standardize:\n\n  * MSA (Master Service Agreement)\n  * NDA\n  * SOW\n  * SLA\n  * DPA\n\n---\n\n### 5.2 Customize for Textile Industry\n\n* [ ] Add clauses for:\n\n  * Design ownership\n  * Usage rights\n  * Revisions / iterations\n* [ ] Ensure clarity in deliverables\n\n---\n\n### 5.3 Internal Legal Alignment\n\n* [ ] Ensure:\n\n  * All contracts align with partnership agreement\n  * No conflicting clauses\n\n---\n\n## 🔴 6. Client Onboarding System\n\n### 6.1 Sales → Onboarding Flow\n\n* [ ] Define steps:\n\n  * Discovery call\n  * NDA (if needed)\n  * Proposal\n  * MSA + SOW signing\n  * Payment\n  * Kickoff\n\n---\n\n### 6.2 Client Data Collection\n\n* [ ] Create onboarding form for:\n\n  * Design preferences\n  * Fabric types\n  * Target market\n  * Brand style\n\n---\n\n### 6.3 Delivery Workflow\n\n* [ ] Define:\n\n  * How designs are generated\n  * Review cycles\n  * Revision limits\n* [ ] Set expectations clearly\n\n---\n\n### 6.4 Communication System\n\n* [ ] Choose tools:\n  (WhatsApp / Slack / Email)\n* [ ] Define response times\n\n---\n\n## 🔴 7. Pilot Clients (VERY IMPORTANT)\n\n### 7.1 Acquire First 1–2 Clients\n\n* [ ] Target:\n\n  * Small textile exporters\n  * Local manufacturers\n* [ ] Offer:\n\n  * Discounted pilot\n  * High-touch service\n\n---\n\n### 7.2 Build Case Studies\n\n* [ ] Track:\n\n  * Number of designs generated\n  * Cost savings\n  * Speed improvement\n* [ ] Turn into proof for future sales\n\n---\n\n## 🔴 8. Brand & Positioning\n\n### 8.1 External Messaging\n\n* [ ] Position as:\n  “AI-powered textile design partner”\n* [ ] Avoid:\n  (overly technical language)\n\n---\n\n### 8.2 Internal Identity\n\n* [ ] Define:\n\n  * Mission (raise youth capability)\n  * Vision (AI-driven production systems)\n* [ ] Keep separate from client messaging\n\n---\n\n## 🔴 9. Systems & Operations\n\n### 9.1 Project Management\n\n* [ ] Set up:\n  (Notion / Trello / ClickUp)\n* [ ] Track:\n\n  * Tasks\n  * Deliverables\n  * Deadlines\n\n---\n\n### 9.2 Documentation\n\n* [ ] Document:\n\n  * Nova system usage\n  * Agent workflows\n  * Internal SOPs\n\n---\n\n### 9.3 Scaling Readiness\n\n* [ ] Ensure:\n\n  * Repeatable workflows\n  * Minimal dependency on you\n\n---\n\n# ⚠️ Final Rule\n\nDO NOT:\n\n* Start client work before partnership clarity\n* Share core tech without IP protection\n* Scale team without agreements\n\n---\n\n# ✅ Immediate Priority Order\n\n1. Partnership Agreement\n2. Revenue Split Model\n3. IP Protection\n4. First Pilot Client\n5. Refine Pricing\n6. Then Scale\n\n---\n','\n',char(10)),0,NULL,1778779880,1779185326);
	`note_id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`author_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `crm_tickets`(`ticket_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`link` text,
	`is_read` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_size` integer,
	`mime_type` text,
	`uploaded_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES "universal_tasks_old"(`task_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
	`task_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text NOT NULL,
	`priority` text,
	`department` text NOT NULL,
	`task_type` text,
	`assignee_id` text,
	`creator_id` text,
	`appointment_id` text,
	`committee_id` text,
	`board_position` integer DEFAULT 0,
	`related_entity_id` text,
	`related_entity_type` text,
	`estimated_hours` real,
	`due_date` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL, start_date TEXT,
	FOREIGN KEY (`assignee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`appointment_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO "universal_tasks" ("task_id","title","description","status","priority","department","task_type","assignee_id","creator_id","appointment_id","committee_id","board_position","related_entity_id","related_entity_type","estimated_hours","due_date","completed_at","created_at","updated_at","start_date") VALUES('task_316c5dec382af613113a6a24d446d502','1. Partnership Structure','','completed','urgent','General','urgent','emp_3dda152e0b8bcbce60d446c4edaa2ebf','user-ceo-new',NULL,NULL,0,NULL,NULL,0,'2026-05-22',1779539742,1778778255,1779539742,NULL);
INSERT INTO "universal_tasks" ("task_id","title","description","status","priority","department","task_type","assignee_id","creator_id","appointment_id","committee_id","board_position","related_entity_id","related_entity_type","estimated_hours","due_date","completed_at","created_at","updated_at","start_date") VALUES('task_8088754cc3a3405d06cb8477926c4066','2. Internal Team & Talent System','','todo','urgent','General','urgent','emp_3dda152e0b8bcbce60d446c4edaa2ebf','user-ceo-new',NULL,NULL,0,NULL,NULL,0,'2026-05-22',NULL,1778778322,1779211679,'2026-05-14');
INSERT INTO "universal_tasks" ("task_id","title","description","status","priority","department","task_type","assignee_id","creator_id","appointment_id","committee_id","board_position","related_entity_id","related_entity_type","estimated_hours","due_date","completed_at","created_at","updated_at","start_date") VALUES('task_d2379eec6bb6669a3a3a94c89e723da5','3. Product & Service Definition','','todo','urgent','General','operational','emp_3dda152e0b8bcbce60d446c4edaa2ebf','user-ceo-new',NULL,NULL,0,NULL,NULL,0,'2026-05-22',NULL,1778778356,1779211689,'2026-05-14');
INSERT INTO "universal_tasks" ("task_id","title","description","status","priority","department","task_type","assignee_id","creator_id","appointment_id","committee_id","board_position","related_entity_id","related_entity_type","estimated_hours","due_date","completed_at","created_at","updated_at","start_date") VALUES('task_69cb9e6dc304eadbf5c508230d5c2694','4. Pricing Strategy','','todo','high','General','urgent','emp_3dda152e0b8bcbce60d446c4edaa2ebf','user-ceo-new',NULL,NULL,0,NULL,NULL,0,'2026-05-22',NULL,1778778384,1779211700,'2026-05-14');
INSERT INTO "universal_tasks" ("task_id","title","description","status","priority","department","task_type","assignee_id","creator_id","appointment_id","committee_id","board_position","related_entity_id","related_entity_type","estimated_hours","due_date","completed_at","created_at","updated_at","start_date") VALUES('task_7d50bbcdd8abfcc842833a4fff6a778c','5. Legal Stack (Client-Facing)','','todo','high','General','urgent','emp_3dda152e0b8bcbce60d446c4edaa2ebf','user-ceo-new',NULL,NULL,0,NULL,NULL,0,'2026-05-22',NULL,1778778408,1779211713,'2026-05-14');
INSERT INTO "universal_tasks" ("task_id","title","description","status","priority","department","task_type","assignee_id","creator_id","appointment_id","committee_id","board_position","related_entity_id","related_entity_type","estimated_hours","due_date","completed_at","created_at","updated_at","start_date") VALUES('task_5433ee511c7b7a8fe2aced372c98c70a','Minor upgradation of Office',replace('1. Update profile Pic issue\n2. UI matching and Favicon\n3. Meetings section in User Dashboard synced with the Calendar\n\n','\n',char(10)),'todo','low','General','technical','emp_3dda152e0b8bcbce60d446c4edaa2ebf','usr_95fbbea2c6df18c4cb8b7dfaf540089c',NULL,'com_afeb1eb343de16e1de5b3cf3e6433ef3',0,NULL,NULL,4,'2026-05-25',NULL,1778782877,1779595319,'2026-05-19');
INSERT INTO "universal_tasks" ("task_id","title","description","status","priority","department","task_type","assignee_id","creator_id","appointment_id","committee_id","board_position","related_entity_id","related_entity_type","estimated_hours","due_date","completed_at","created_at","updated_at","start_date") VALUES('task_fd0ee4066a787b155ae4196d183af5cd','Avatar Issue','Avatar is not being loaded','in_progress','high','Tech','technical','emp_3dda152e0b8bcbce60d446c4edaa2ebf','usr_95fbbea2c6df18c4cb8b7dfaf540089c',NULL,'com_afeb1eb343de16e1de5b3cf3e6433ef3',0,NULL,NULL,0,'2026-05-22',1779592528,1778784077,1779599036,NULL);
INSERT INTO "universal_tasks" ("task_id","title","description","status","priority","department","task_type","assignee_id","creator_id","appointment_id","committee_id","board_position","related_entity_id","related_entity_type","estimated_hours","due_date","completed_at","created_at","updated_at","start_date") VALUES('task_6a733d2cb1d3c872b4d9ebdcb1f6b8d7','Test task','','todo','medium','Tech','operational','emp_3dda152e0b8bcbce60d446c4edaa2ebf','usr_95fbbea2c6df18c4cb8b7dfaf540089c',NULL,NULL,0,NULL,NULL,0,NULL,NULL,1779599143,1779599143,NULL);
INSERT INTO "universal_tasks" ("task_id","title","description","status","priority","department","task_type","assignee_id","creator_id","appointment_id","committee_id","board_position","related_entity_id","related_entity_type","estimated_hours","due_date","completed_at","created_at","updated_at","start_date") VALUES('task_c729f56e4c287460911e7ea8dec2a2fb','adfadsf','','todo','medium','General','operational','emp_3dda152e0b8bcbce60d446c4edaa2ebf','usr_95fbbea2c6df18c4cb8b7dfaf540089c',NULL,NULL,0,NULL,NULL,0,NULL,NULL,1779599810,1779599810,NULL);
INSERT INTO "universal_tasks" ("task_id","title","description","status","priority","department","task_type","assignee_id","creator_id","appointment_id","committee_id","board_position","related_entity_id","related_entity_type","estimated_hours","due_date","completed_at","created_at","updated_at","start_date") VALUES('task_5e2d102ae3dcc8a690fd4edc508918a5','Particle',NULL,'todo',NULL,'Tech',NULL,'emp_3e4ef151184bcccc5e29907150797080','usr_22f5b2d7f89240a1e4dfb3190d725da6',NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,1779621073,1779621122,NULL);
INSERT INTO "app_messages" ("id","sender_app","target_app","sender_id","type","title","message","priority","is_resolved","created_at") VALUES('msg_be10760c04cae521911acc10cf3518cf','legal','hr','user-ceo-new','request','Give access to legal plz','Quick','medium',1,1778556462);
INSERT INTO "app_messages" ("id","sender_app","target_app","sender_id","type","title","message","priority","is_resolved","created_at") VALUES('msg_2b6943e930806e8af8c11bbd788a8a63','legal','tech','usr_95fbbea2c6df18c4cb8b7dfaf540089c','request','New View','Viewing an asset like a pdf should open an in house viewer ','medium',0,1779037570);
INSERT INTO "calendar_feeds" ("id","user_id","token","created_at","updated_at") VALUES('cal_6ddcfc0c5bd90f9fe2ce9e003f0a7ee7','user-ceo-new','jr85ytdra6r3ie8mhor6',1778560774,1778609826);
INSERT INTO "calendar_feeds" ("id","user_id","token","created_at","updated_at") VALUES('cal_d196f6005a5002b92f1c9e32ddde1296','usr_95fbbea2c6df18c4cb8b7dfaf540089c','12g8zfem5napjxvi7x69me',1778778554,1778784144);
INSERT INTO "calendar_feeds" ("id","user_id","token","created_at","updated_at") VALUES('cal_fcf46b6ac76dae03012616a7661c2385','usr_22f5b2d7f89240a1e4dfb3190d725da6','uw16h0nccfgd1f2oods9r',1779620707,1779620707);
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('d1_migrations',42);
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);
CREATE UNIQUE INDEX `permissions_name_unique` ON `permissions` (`name`);
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);
CREATE UNIQUE INDEX `users_logins_email_unique` ON `users_logins` (`email`);
CREATE UNIQUE INDEX `employees_slack_id_unique` ON `employees` (`slack_id`);
CREATE UNIQUE INDEX `employees_airtable_user_id_unique` ON `employees` (`airtable_user_id`);
CREATE UNIQUE INDEX `invoices_invoice_number_unique` ON `invoices` (`invoice_number`);
CREATE UNIQUE INDEX `pl_reports_report_no_unique` ON `pl_reports` (`report_no`);
CREATE UNIQUE INDEX users_logins_username_unique ON users_logins (username);
CREATE UNIQUE INDEX `client_logins_email_unique` ON `client_logins` (`email`);
