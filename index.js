// dsh-conversation-minimap v1.1.0 — host half.
// The feature itself lives in the browser (client.js). The host half:
//   1. mounts the bundle layer (see cordis.patch.yml),
//   2. injects the layer config into every index.html response as
//      window.__DSH_MINIMAP_CONFIG__, which client.js reads at load.
// Seam: the official webServer.tapIndex (same as dsh-theme-plugin).

export const name = 'conversation-minimap'

function injectConfig(html, config) {
  const payload = JSON.stringify(config ?? {}).replaceAll('<', '\\u003c')
  const script = `<script>window.__DSH_MINIMAP_CONFIG__ = ${payload}</script>`
  const head = html.indexOf('<head>')
  if (head !== -1) return html.slice(0, head + 6) + script + html.slice(head + 6)
  return script + html
}

export function apply(ctx, config) {
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => httpCtx.webServer.tapIndex((html) => injectConfig(html, config)),
      'dsh-conversation-minimap: inject config into index responses'
    )
  })
}
