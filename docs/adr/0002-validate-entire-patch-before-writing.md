# Validate the entire patch before writing

Validate syntax, workspace paths, and context matches for every operation before writing any file. A validation failure leaves all files unchanged, rather than retaining earlier operations from the same patch. This decision does not promise rollback for failures during filesystem writes.
