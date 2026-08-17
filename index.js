// dsh-conversation-minimap v0.1 — host half.
// The whole feature lives in the browser (client.js): the client observes the
// conversation DOM, renders the minimap rail, and handles hover/click.
// The host half exists only so the bundle layer mounts and the client
// manifest is discovered by dsh-client-modules. No host services needed.

export const name = 'conversation-minimap'

export function apply() {
  // no-op: all logic is client-side
}
