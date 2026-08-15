PRAGMA foreign_keys = OFF;
CREATE TABLE `transactions_new` (
  `transaction_id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `transaction_date` text,
  `amount` real,
  `transaction_type` text,
  `description` text,
  `approved` integer,
  `created_by` text,
  `committee_id` text REFERENCES committees(committee_id),
  `client_id` text REFERENCES clients(client_id),
  `account_id` text REFERENCES accounts(account_id),
  `invoice_id` text REFERENCES invoices(invoice_id),
  `fund_request_id` text REFERENCES fund_requests(fund_request_id),
  `created_at` integer NOT NULL
);
INSERT INTO `transactions_new` SELECT `transaction_id`,`name`,`transaction_date`,`amount`,`transaction_type`,`description`,`approved`,`created_by`,`committee_id`,`client_id`,`account_id`,`invoice_id`,`fund_request_id`,`created_at` FROM `transactions`;
DROP TABLE `transactions`;
ALTER TABLE `transactions_new` RENAME TO `transactions`;
DROP TABLE IF EXISTS `channels`;
PRAGMA foreign_keys = ON;