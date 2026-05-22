/**
 * Tool-registration helpers. Pure functions only — no I/O, no globals.
 */

/**
 * Returns true if a tool's writeScope is permitted by the current write mode.
 *   scope 'read'        → always allowed
 *   scope 'write'       → allowed in 'write' and 'full' modes
 *   scope 'destructive' → allowed only in 'full' mode
 *   unknown scope       → denied
 */
export function isToolAllowed(tool, writeMode) {
  const scope = tool.writeScope || 'read';
  if (scope === 'read') return true;
  if (scope === 'write') return writeMode === 'write' || writeMode === 'full';
  if (scope === 'destructive') return writeMode === 'full';
  return false;
}

/**
 * Build MCP tool annotations from our internal writeScope tag.
 * Maps to the spec's readOnlyHint / destructiveHint / openWorldHint.
 */
export function buildToolAnnotations(tool) {
  const scope = tool.writeScope || 'read';
  return {
    readOnlyHint: scope === 'read',
    destructiveHint: scope === 'destructive',
    openWorldHint: true, // calls a remote API
  };
}
