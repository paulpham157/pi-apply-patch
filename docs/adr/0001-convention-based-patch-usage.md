# Use apply_patch by convention

Use the universal apply_patch tool in place of native edit/write tools and instruct models to use it for file changes. Keep bash available for commands, including builds and tests, without attempting to prevent file writes through bash. This preserves the command workflow; any workspace confinement provided by apply_patch is a boundary of that tool, not a sandbox for the entire agent.
