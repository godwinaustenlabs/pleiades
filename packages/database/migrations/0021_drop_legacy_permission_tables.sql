-- Follow-up to 0020. Apply ONLY after the roles-only path has been verified in
-- production, since this is the point of no return for the old data.
--
-- user_app_permissions : superseded by role_app_permissions; 0020 copied its
--                        rows onto the four derived roles.
-- user_app_access      : deprecated, zero rows in production.
--
-- role_permissions and role_hierarchy are NOT dropped here: they were declared
-- in the Drizzle schema but never actually created in production, so there is
-- nothing to drop.

DROP TABLE IF EXISTS user_app_permissions;
DROP TABLE IF EXISTS user_app_access;
