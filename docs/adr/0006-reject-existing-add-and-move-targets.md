# Reject existing add and move targets

Treat an existing Add File target or Move destination as a validation error instead of overwriting it. Whole-patch validation must detect this before any file is written. Models must use Update File when modifying an existing file.
