-- No efficiency score, and no hour estimates on tasks.
--
-- Evaluation here is manual (`performance_reviews`), so a number on the employee
-- record called "efficiency" claimed something nobody was measuring. Tasks are not
-- valued in hours either — pay is per task and nobody is held to a duration — so
-- the field saying what a task "should" take goes for the same reason. Time spent is
-- now logged, not estimated: see 0053 and docs/attendance-design.md.
--
-- Plain DROP COLUMN, no table rebuild: none of the three is indexed, constrained
-- or referenced by a view, which is what would make SQLite refuse. Export the
-- values before applying this to pleiades-db — dropped data does not come back.
--
-- Not touched: `tasks.estimated_hours` in schema/tech.ts. That table does not exist
-- in production (the one gap schema-drift.test.ts names), so there is no column to drop.
ALTER TABLE employees DROP COLUMN efficiency_score;
ALTER TABLE universal_tasks DROP COLUMN estimated_hours;
ALTER TABLE acq_tasks DROP COLUMN estimated_effort;
