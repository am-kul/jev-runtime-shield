# Replay provenance

`decisions.json` contains **authored demonstration fixtures**, not previously captured Jev responses. The metadata records this explicitly. No live response provenance, model accuracy, or timing is claimed.

Each scenario names the fixture needed at an evaluation checkpoint. Replay returns those values unchanged; it does not classify arbitrary activity. The rest of the pipeline computes real features from SQLite and applies real local policy.

Choice probability and Choice confidence are separate illustrative fields. Intent stores malicious probability; it does not invent a Noul confidence value. Live mode always uses the official HTTP provider and never falls back to these fixtures.
