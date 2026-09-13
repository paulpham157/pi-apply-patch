# Offer dry-run preview as a JSON-only option

Add an optional `dryRun` flag to the tool's JSON input schema that runs the existing validation pipeline and returns the rendered preview without writing any file. Keep the grammar route unchanged: grammar calls supply raw patch text with no channel for extra parameters, and changing the Codex grammar would break the stability constraint. A successful dry run reports validation only, consistent with patch validation never guaranteeing later writes.
