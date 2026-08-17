// dsh-conversation-minimap v0.2 — client bundle.
// Prompt-based conversation minimap for the DSH Web GUI.
//
// Product: a vertical navigation rail on the LEFT edge of long conversations.
//   - Each anchor = one user prompt (DOM rows with data-chat-flow-kind
//     "user" / "steering", anchored by data-chat-anchor-key).
//   - Hover an anchor -> fish-eye grow + floating preview of that prompt.
//   - Click an anchor -> smooth-scroll to the corresponding message and
//     flash-highlight it for 2s.
//   - The rail maps the FULL conversation height: gaps between anchors are
//     proportional to the distances between the user messages (flex-grow).
//
// v0.2: the DSH conversation view renders a WINDOW of the most recent
// messages (older pages load on demand), so on mount we drive the official
// `ctx.sessions.scope(id).conversation.loadOlder()` API page by page until
// the whole history is in the DOM. Only then are all user prompts visible
// as anchors. The rail shows a small "loading history" hint meanwhile.
//
// Implementation notes:
//   - Official web-shell closure-factory shape; plain JS, no build step.
//   - DOM-only + the public loadOlder seam; everything guarded — any
//     unexpected failure silently disables the minimap only.

window.__ModuleLoader__.load({
  id: 'dsh-conversation-minimap',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // ------------------------------------------------------------------
    // Config
    // ------------------------------------------------------------------
    var MIN_PROMPTS = 4 // show the rail only with at least this many prompts
    var ANCHOR_SIZE = 6 // anchor dot diameter, px
    var RAIL_LEFT = 10 // rail distance from the conversation viewport left edge, px
    var PREVIEW_MAX_CHARS = 180
    var HIGHLIGHT_MS = 2000
    var SYNC_MAX_PAGES = 120 // safety cap for the history-sync loop
    var SYNC_PAGE_DELAY_MS = 60 // settle time between history pages
    var USER_KINDS = { user: true, steering: true }
    var SCROLL_SEL = '[data-conversation-scroll]'
    var ANCHOR_SEL = '[data-chat-anchor-key]'

    // ------------------------------------------------------------------
    // Styles
    // ------------------------------------------------------------------
    var STYLE_ID = 'dsh-conversation-minimap-style'
    var css = [
      '.dsh-mm-seat{position:absolute;top:0;bottom:0;left:' + RAIL_LEFT + 'px;width:16px;pointer-events:none;z-index:6}',
      '.dsh-mm-rail{position:absolute;top:10px;bottom:10px;left:0;width:16px;display:flex;flex-direction:column;pointer-events:none}',
      '.dsh-mm-gap{flex:1 1 0;min-height:0}',
      '.dsh-mm-anchor{flex:0 0 auto;box-sizing:border-box;width:' + ANCHOR_SIZE + 'px;height:' + ANCHOR_SIZE + 'px;margin:0 auto;border-radius:3px;background:var(--dsw-alias-label-tertiary,rgba(120,120,120,.45));cursor:pointer;pointer-events:auto;transition:transform .12s var(--ds-ease-in-out,cubic-bezier(.4,0,.2,1)),background-color .12s var(--ds-ease-in-out,cubic-bezier(.4,0,.2,1)),width .12s var(--ds-ease-in-out,cubic-bezier(.4,0,.2,1)),border-radius .12s var(--ds-ease-in-out,cubic-bezier(.4,0,.2,1))}',
      '.dsh-mm-anchor:hover{width:14px;border-radius:4px;background:var(--dsw-alias-label-secondary,rgba(60,60,60,.7))}',
      '.dsh-mm-anchor.dsh-mm-active{background:var(--dsw-static-deepseek-500,#4176e6)}',
      '.dsh-mm-anchor.dsh-mm-jumped{background:var(--dsw-static-green-500,#22c55e)}',
      '.dsh-mm-preview{position:fixed;z-index:1000;box-sizing:border-box;max-width:320px;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:var(--dsw-alias-bg-layer-2,#ffffff);box-shadow:var(--dsw-shadow-lv2,0 6px 24px rgba(0,0,0,.16));color:var(--dsw-alias-label-primary,#1f1f1f);font:12px/1.5 var(--ds-font-family-code,"SF Mono",Consolas,monospace);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;pointer-events:none;white-space:pre-wrap;word-break:break-word}',
      '.dsh-mm-preview-label{display:block;margin-bottom:2px;color:var(--dsw-alias-label-caption,rgba(120,120,120,.8));font:10px/1.4 var(--ds-font-family-code,monospace)}',
      '.dsh-mm-syncing{position:absolute;bottom:-2px;left:0;width:16px;text-align:center;color:var(--dsw-alias-label-caption,rgba(120,120,120,.8));font-size:9px;line-height:1;display:none;pointer-events:none}',
      '.dsh-mm-jump-highlight{outline:2px solid var(--dsw-static-deepseek-500,#4176e6);outline-offset:-2px;border-radius:8px;transition:outline-color .3s}',
      '.dsh-mm-jump-highlight.dsh-mm-fade{outline-color:transparent}'
    ].join('\n')

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return
      var style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = css
      document.head.appendChild(style)
    }

    // ------------------------------------------------------------------
    // DOM helpers
    // ------------------------------------------------------------------
    function findScroll() {
      return document.querySelector(SCROLL_SEL)
    }

    function previewText(row) {
      try {
        var text = (row.innerText || '').replace(/\s+/g, ' ').trim()
        if (text.length > PREVIEW_MAX_CHARS) text = text.slice(0, PREVIEW_MAX_CHARS) + '…'
        return text
      } catch (e) {
        return ''
      }
    }


    function sleep(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms) })
    }

    // ------------------------------------------------------------------
    // Minimap controller — one instance per mounted conversation viewport
    // ------------------------------------------------------------------
    function MinimapController(scroll, sessionId, ctx) {
      this.scroll = scroll
      this.sessionId = sessionId || null
      this.ctx = ctx || null
      this.parent = scroll.parentElement
      this.seat = null
      this.rail = null
      this.syncHint = null
      this.anchors = []
      this.list = null
      this.observer = null
      this.previewEl = null
      this.highlightTimer = null
      this.rafPending = false
      this.syncing = false
      this.disposed = false
      this.parentWasStatic = false
    }

    MinimapController.prototype.attach = function () {
      if (this.disposed || !this.parent) return
      try {
        var pos = getComputedStyle(this.parent).position
        if (pos === 'static') {
          this.parent.style.position = 'relative'
          this.parentWasStatic = true
        }
        this.seat = document.createElement('div')
        this.seat.className = 'dsh-mm-seat'
        this.rail = document.createElement('div')
        this.rail.className = 'dsh-mm-rail'
        this.syncHint = document.createElement('div')
        this.syncHint.className = 'dsh-mm-syncing'
        this.syncHint.textContent = '⋯'
        this.rail.appendChild(this.syncHint)
        this.seat.appendChild(this.rail)
        this.parent.appendChild(this.seat)

        this.list = this.findList()
        this.observer = new MutationObserver(() => this.scheduleRebuild())
        if (this.list) {
          this.observer.observe(this.list, { childList: true, subtree: true })
        }

        this.onScrollBound = this.onScroll.bind(this)
        this.scroll.addEventListener('scroll', this.onScrollBound, { passive: true })

        this.rebuild()
        this.syncHistory()
      } catch (e) {
        console.warn('[dsh-conversation-minimap] attach failed', e)
        this.destroy()
      }
    }

    MinimapController.prototype.findList = function () {
      var first = this.scroll.querySelector(ANCHOR_SEL)
      return first ? first.parentElement : null
    }

    MinimapController.prototype.scheduleRebuild = function () {
      var self = this
      if (this.rafPending || this.disposed) return
      this.rafPending = true
      requestAnimationFrame(function () {
        self.rafPending = false
        if (self.disposed) return
        self.rebuild()
      })
    }

    // --- History sync: pull older pages until the conversation start ---
    MinimapController.prototype.sessionConversation = function () {
      try {
        if (!this.ctx || !this.ctx.sessions || !this.sessionId) return null
        // binding() returns a plain object ({ sessionId, session, ctx }) — the
        // dynamic facade denies cordis Contexts but passes plain objects, so
        // binding.session is reachable (ctx.sessions.scope(id) would return a
        // Context and get denied by the guard).
        var binding = this.ctx.sessions.binding(this.sessionId)
        return binding && binding.session ? binding.session : null
      } catch (e) {
        return null
      }
    }

    MinimapController.prototype.firstAnchorKey = function () {
      var root = this.list || this.scroll
      var first = root ? root.querySelector(ANCHOR_SEL) : null
      return first ? first.getAttribute('data-chat-anchor-key') : null
    }

    MinimapController.prototype.syncHistory = function () {
      var self = this
      var conv = this.sessionConversation()
      if (!conv || typeof conv.loadOlder !== 'function') return
      if (!this.list) {
        // Conversation rows not rendered yet — retry shortly (MountManager also
        // re-attaches once rows appear).
        var self = this
        setTimeout(function () { if (!self.disposed && !self.syncing) self.syncHistory() }, 600)
        return
      }
      this.syncing = true
      if (this.syncHint) this.syncHint.style.display = 'block'
      ;(async function () {
        try {
          for (var i = 0; i < SYNC_MAX_PAGES && !self.disposed; i++) {
            var before = self.firstAnchorKey()
            await conv.loadOlder()
            await sleep(SYNC_PAGE_DELAY_MS)
            if (self.disposed) return
            var after = self.firstAnchorKey()
            if (after === before) break // history exhausted
          }
        } catch (e) {
          console.warn('[dsh-conversation-minimap] history sync stopped', e)
        } finally {
          if (self.disposed) return
          self.syncing = false
          if (self.syncHint) self.syncHint.style.display = 'none'
          self.rebuild()
        }
      })()
    }

    MinimapController.prototype.collect = function () {
      if (!this.list) return []
      var out = []
      var rows = this.list.querySelectorAll(ANCHOR_SEL)
      for (var i = 0; i < rows.length; i++) {
        var kind = rows[i].getAttribute('data-chat-flow-kind')
        if (USER_KINDS[kind]) {
          out.push({ key: rows[i].getAttribute('data-chat-anchor-key'), row: rows[i] })
        }
      }
      return out
    }

    MinimapController.prototype.rebuild = function () {
      if (this.disposed) return
      try {
        var next = this.collect()
        if (this.sameKeys(next)) return
        this.anchors = next
        this.render()
      } catch (e) {
        console.warn('[dsh-conversation-minimap] rebuild failed', e)
      }
    }

    MinimapController.prototype.sameKeys = function (next) {
      var prev = this.anchors
      if (prev.length !== next.length) return false
      for (var i = 0; i < prev.length; i++) {
        if (prev[i].key !== next[i].key) return false
      }
      return true
    }

    MinimapController.prototype.render = function () {
      while (this.rail.firstChild) this.rail.removeChild(this.rail.firstChild)
      this.rail.appendChild(this.syncHint)
      var shown = this.anchors.length >= MIN_PROMPTS
      this.seat.style.display = shown ? '' : 'none'
      if (!shown) return

      var self = this
      var gaps = this.computeGaps()

      function addGap(g) {
        var el = document.createElement('div')
        el.className = 'dsh-mm-gap'
        el.style.flexGrow = Math.max(g, 0).toFixed(2)
        self.rail.appendChild(el)
        return el
      }

      for (var i = 0; i < this.anchors.length; i++) {
        addGap(gaps[i])
        var a = this.anchors[i]
        var dot = document.createElement('div')
        dot.className = 'dsh-mm-anchor'
        dot.title = previewText(a.row)
        dot.setAttribute('data-mm-key', a.key)
        dot.addEventListener('pointerenter', function (ev) { self.onHover(ev.currentTarget) })
        dot.addEventListener('pointerleave', function () { self.hidePreview() })
        dot.addEventListener('click', function (ev) { self.onJump(ev.currentTarget) })
        this.rail.appendChild(dot)
        a.anchorEl = dot
        a.pos = 0
        a.height = 0
      }
      addGap(gaps[this.anchors.length])
      this.rail.appendChild(this.syncHint)
      this.updatePositions()
    }

    MinimapController.prototype.computeGaps = function () {
      var listRect = this.list.getBoundingClientRect()
      var scrollTop = this.scroll.scrollTop
      var contentH = Math.max(this.list.scrollHeight || 0, listRect.height, 1)
      var gaps = []
      var prev = 0
      for (var i = 0; i < this.anchors.length; i++) {
        var rect = this.anchors[i].row.getBoundingClientRect()
        var top = rect.top - listRect.top + scrollTop
        gaps.push(top - prev)
        prev = top + rect.height
      }
      gaps.push(Math.max(contentH - prev, 0))
      return gaps
    }

    MinimapController.prototype.updatePositions = function () {
      if (!this.list) return
      var listRect = this.list.getBoundingClientRect()
      var scrollTop = this.scroll.scrollTop
      for (var i = 0; i < this.anchors.length; i++) {
        var rect = this.anchors[i].row.getBoundingClientRect()
        this.anchors[i].pos = rect.top - listRect.top + scrollTop
        this.anchors[i].height = rect.height
      }
      this.updateActive()
    }

    MinimapController.prototype.onScroll = function () {
      var self = this
      if (this.rafPending) return
      this.rafPending = true
      requestAnimationFrame(function () {
        self.rafPending = false
        if (self.disposed) return
        self.updateActive()
      })
    }

    MinimapController.prototype.updateActive = function () {
      if (!this.anchors.length) return
      var threshold = this.scroll.scrollTop + 8
      var active = 0
      for (var i = 0; i < this.anchors.length; i++) {
        if (this.anchors[i].pos <= threshold) active = i
      }
      for (var j = 0; j < this.anchors.length; j++) {
        var el = this.anchors[j].anchorEl
        if (el) el.classList.toggle('dsh-mm-active', j === active)
      }
    }

    MinimapController.prototype.onHover = function (dot) {
      var key = dot.getAttribute('data-mm-key')
      for (var i = 0; i < this.anchors.length; i++) {
        if (this.anchors[i].key === key) {
          this.showPreview(this.anchors[i].row, dot)
          return
        }
      }
    }

    MinimapController.prototype.showPreview = function (row, dot) {
      this.hidePreview()
      var el = document.createElement('div')
      el.className = 'dsh-mm-preview'
      var label = document.createElement('span')
      label.className = 'dsh-mm-preview-label'
      label.textContent = 'Prompt'
      var text = document.createElement('span')
      text.textContent = previewText(row) || '(empty)'
      el.appendChild(label)
      el.appendChild(text)
      document.body.appendChild(el)
      this.previewEl = el

      var rect = dot.getBoundingClientRect()
      var pr = el.getBoundingClientRect()
      var left = rect.left - pr.width - 10
      if (left < 8) left = rect.right + 10
      var top = rect.top + rect.height / 2 - pr.height / 2
      top = Math.max(8, Math.min(top, window.innerHeight - pr.height - 8))
      el.style.left = left + 'px'
      el.style.top = top + 'px'
    }

    MinimapController.prototype.hidePreview = function () {
      if (this.previewEl) {
        this.previewEl.remove()
        this.previewEl = null
      }
    }

    MinimapController.prototype.onJump = function (dot) {
      var key = dot.getAttribute('data-mm-key')
      var self = this
      for (var i = 0; i < this.anchors.length; i++) {
        var a = this.anchors[i]
        if (a.key !== key) continue
        try {
          a.row.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } catch (e) {
          a.row.scrollIntoView()
        }
        a.row.classList.add('dsh-mm-jump-highlight')
        dot.classList.add('dsh-mm-jumped')
        if (this.highlightTimer) clearTimeout(this.highlightTimer)
        this.highlightTimer = setTimeout(function () {
          a.row.classList.add('dsh-mm-fade')
          setTimeout(function () {
            a.row.classList.remove('dsh-mm-jump-highlight', 'dsh-mm-fade')
            dot.classList.remove('dsh-mm-jumped')
          }, 300)
        }, HIGHLIGHT_MS)
        break
      }
    }

    MinimapController.prototype.destroy = function () {
      if (this.disposed) return
      this.disposed = true
      if (this.highlightTimer) clearTimeout(this.highlightTimer)
      if (this.observer) this.observer.disconnect()
      if (this.scroll && this.onScrollBound) this.scroll.removeEventListener('scroll', this.onScrollBound)
      this.hidePreview()
      if (this.seat && this.seat.parentElement) this.seat.parentElement.removeChild(this.seat)
      if (this.parentWasStatic && this.parent) this.parent.style.position = ''
      this.seat = null
      this.rail = null
      this.list = null
      this.anchors = []
    }

    // ------------------------------------------------------------------
    // Mount manager — tracks the live conversation viewport + session
    // ------------------------------------------------------------------
    function MountManager(ctx) {
      this.ctx = ctx || null
      this.controller = null
      this.timer = null
      this.lastSessionId = null
    }

    MountManager.prototype.start = function () {
      var self = this
      try {
        ensureStyle()
        this.check()
        this.timer = setInterval(function () { self.check() }, 600)
        // Re-check when the active session changes.
        try {
          if (this.ctx && this.ctx.sessions && this.ctx.sessions.list) {
            this.ctx.sessions.list.subscribe(function () { self.check() })
          }
        } catch (e) { /* ignore */ }
      } catch (e) {
        console.warn('[dsh-conversation-minimap] start failed', e)
      }
    }

    MountManager.prototype.currentSessionId = function () {
      try {
        if (!this.ctx || !this.ctx.sessions || !this.ctx.sessions.list) return null
        var snap = this.ctx.sessions.list.getSnapshot()
        return snap && snap.current ? snap.current : null
      } catch (e) {
        return null
      }
    }

    MountManager.prototype.check = function () {
      try {
        var scroll = findScroll()
        var sessionId = this.currentSessionId()
        if (!scroll || !sessionId) {
          if (this.controller) {
            this.controller.destroy()
            this.controller = null
          }
          return
        }
        if (this.controller &&
            this.controller.scroll === scroll &&
            this.controller.sessionId === sessionId &&
            !this.controller.disposed) {
          // The conversation view rendered after we attached (hero/loading
          // first): re-attach so the history sync runs against real rows.
          if (this.controller.list === null && scroll.querySelector(ANCHOR_SEL)) {
            this.controller.destroy()
            this.controller = null
          } else {
            return
          }
        }
        if (this.controller) this.controller.destroy()
        this.controller = new MinimapController(scroll, sessionId, this.ctx)
        this.controller.attach()
      } catch (e) {
        console.warn('[dsh-conversation-minimap] check failed', e)
      }
    }

    MountManager.prototype.stop = function () {
      if (this.timer) clearInterval(this.timer)
      if (this.controller) this.controller.destroy()
      this.controller = null
    }

    // ------------------------------------------------------------------
    // Plugin entry
    // ------------------------------------------------------------------
    function apply(ctx) {
      ctx.effect(function () {
        var manager = new MountManager(ctx)
        manager.start()
        return function () { manager.stop() }
      }, 'dsh-conversation-minimap: mount')
    }

    exports.apply = apply
    exports.inject = ['sessions']
    return module.exports
  }
})
