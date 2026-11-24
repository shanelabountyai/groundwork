-- CapacityOverride is the log of dispatchers pushing a crew-day past capacity on
-- purpose (decisions.md: "the audit trail has one format"). The schema called it
-- append-only; this makes the database enforce it. TRUNCATE is left alone (row
-- triggers do not fire on it), so test resets and `db:seed -- --reset` still work.
CREATE FUNCTION capacity_override_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CapacityOverride is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "CapacityOverride_append_only"
  BEFORE UPDATE OR DELETE ON "CapacityOverride"
  FOR EACH ROW EXECUTE FUNCTION capacity_override_append_only();
