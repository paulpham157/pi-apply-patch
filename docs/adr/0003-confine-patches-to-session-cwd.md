# Confine patches to the session working directory

Use the Pi session working directory (cwd), rather than the Git repository root, as the workspace boundary for apply_patch. Reject operations that escape that boundary, including through symlinks, and check both source and destination paths for moves. A session opened in a repository subdirectory therefore cannot patch sibling directories through this tool.
