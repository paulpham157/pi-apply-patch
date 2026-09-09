# Reject overlapping operation paths

Reject separate operations in one patch when their source or destination paths overlap. Whole-patch validation must detect the conflict before writing, avoiding order-dependent changes. Multiple hunks within one Update File operation and a Move to attached to that operation remain allowed. Case-only path aliases are conservatively treated as overlapping on every filesystem.
