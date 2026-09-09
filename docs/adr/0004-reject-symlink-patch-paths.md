# Reject patch paths through symlinks

Reject patch paths whose components within the workspace include a symlink, including the final file component, even when the link target is inside the workspace. Apply this rule to every operation and to both source and destination paths for moves. Callers must use direct workspace paths, avoiding ambiguity between modifying a link and modifying its target.
