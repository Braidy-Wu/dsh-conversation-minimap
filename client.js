// dsh-conversation-minimap v1.2.0 — client bundle.
// Prompt-based conversation minimap for the DSH Web GUI.
//
// Product: a vertical navigation rail on the LEFT edge of long conversations.
//   - One evenly-spaced horizontal capsule per user prompt (DOM rows with
//     data-chat-flow-kind "user"/"steering", keyed by data-chat-anchor-key).
//   - The anchor column is centered in the rail; when it overflows (many
//     prompts / short window), the visible window centers on the ACTIVE
//     anchor and the edges fade via a mask — anchors never exceed the rail.
//   - Hover: fish-eye bell curve grows the bars rightward under the cursor,
//     plus a floating preview of the full prompt.
//   - Click: smooth-scroll to the message, flash-highlight it for 2s.
//   - Active marker: a blue glowing bar follows the current prompt (switches
//     when the prompt's center crosses the viewport's center); on window
//     resize the view snaps back to the bottom if the user was there.
//
// History: the DSH conversation view renders a WINDOW of the most recent
// messages, so on mount we pull older pages via the official
// `ctx.sessions.binding(id).session.loadOlder()` API until the whole history
// is in the DOM — every prompt in a long conversation is reachable. Nothing
// renders until the sync finishes (the full rail appears at once).
//
// Implementation notes:
//   - Official web-shell closure-factory shape; plain JS, no build step.
//   - DOM + the public loadOlder seam only; everything guarded — any
//     unexpected failure silently disables the minimap, never the GUI.

window.__ModuleLoader__.load({
  id: 'dsh-conversation-minimap',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // ------------------------------------------------------------------
    // Config (layer config injected by the host half via
    // window.__DSH_MINIMAP_CONFIG__; values are clamped to sane ranges)
    // ------------------------------------------------------------------
    var __cfg = {}
    try {
      if (typeof window !== 'undefined' && window.__DSH_MINIMAP_CONFIG__) __cfg = window.__DSH_MINIMAP_CONFIG__
    } catch (e) { /* defaults */ }
    function cfgNum(v, lo, hi, def) {
      var n = Number(v)
      return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def
    }
    var MIN_PROMPTS = cfgNum(__cfg.minPrompts, 0, 100, 4) // show the rail only with at least this many prompts
    var ENABLED = __cfg.enabled === undefined ? true : !!__cfg.enabled // master switch
    var ANCHOR_H = cfgNum(__cfg.anchorSize, 2, 8, 3) // anchor bar height, px (configurable)
    var RAIL_LEFT = 10 // rail distance from the conversation viewport left edge, px
    var HIGHLIGHT_MS = 2000
    var SYNC_MAX_PAGES = 120 // safety cap for the history-sync loop
    var SYNC_PAGE_DELAY_MS = 40 // settle time between history pages
    var ANCHOR_GAP = 12 // fixed interval between anchors, px (keep in sync with CSS)
    var BASE_W = 12 // anchor base width, px
    var PEAK_W = 44 // fish-eye peak width, px (mouse-over bar)
    var FISHEYE_SIGMA = 18 // gaussian sigma for the bell curve, px
    var SEAT_W = 72 // seat width, px — wide enough for the rightward fish-eye growth
    var MIN_RAIL_H = 80 // keep a usable rail even in very short windows
    var FADE_EDGE = 22 // mask: fully transparent until this px from the rail edges
    var FADE_SOLID = 54 // mask: fully opaque past this px from the rail edges
    var USER_KINDS = { user: true, steering: true }
    var SCROLL_SEL = '[data-conversation-scroll]'
    var ANCHOR_SEL = '[data-chat-anchor-key]'

    // ------------------------------------------------------------------
    // Styles
    // ------------------------------------------------------------------
    var STYLE_ID = 'dsh-conversation-minimap-style'
    var css = [
      '.dsh-mm-seat{position:absolute;left:' + RAIL_LEFT + 'px;width:' + SEAT_W + 'px;pointer-events:none;z-index:6;overflow:hidden;-webkit-mask-image:linear-gradient(to bottom,transparent 0,transparent ' + FADE_EDGE + 'px,#000 ' + FADE_SOLID + 'px,#000 calc(100% - ' + FADE_SOLID + 'px),transparent calc(100% - ' + FADE_EDGE + 'px),transparent 100%);mask-image:linear-gradient(to bottom,transparent 0,transparent ' + FADE_EDGE + 'px,#000 ' + FADE_SOLID + 'px,#000 calc(100% - ' + FADE_SOLID + 'px),transparent calc(100% - ' + FADE_EDGE + 'px),transparent 100%)}',
      '.dsh-mm-rail{position:absolute;left:0;width:16px;display:flex;flex-direction:column;pointer-events:auto;overflow:visible}',
      '.dsh-mm-inner{display:flex;flex-direction:column;align-items:flex-start;gap:' + ANCHOR_GAP + 'px;pointer-events:none;will-change:transform}',
      '.dsh-mm-anchor{flex:0 0 ' + ANCHOR_H + 'px;box-sizing:border-box;width:' + BASE_W + 'px;height:' + ANCHOR_H + 'px;margin-left:2px;border-radius:2px;background:rgba(128,128,128,.5);cursor:pointer;pointer-events:auto;transition:width .18s ease-out,background-color .18s ease-out}',
      '.dsh-mm-anchor.dsh-mm-hot{background:rgba(35,35,35,.95)}',
      '.dsh-mm-anchor.dsh-mm-enlarged{background:rgba(90,90,90,.7)}',
      '.dsh-mm-anchor.dsh-mm-active{background:var(--dsw-static-deepseek-500,#4176e6);box-shadow:0 0 5px rgba(65,118,230,.85)}',
      '.dsh-mm-anchor.dsh-mm-jumped{background:var(--dsw-static-green-500,#22c55e)}',
      '.dsh-mm-preview{position:fixed;z-index:1000;box-sizing:border-box;max-width:380px;max-height:50vh;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:var(--dsw-alias-bg-layer-2,#ffffff);box-shadow:var(--dsw-shadow-lv2,0 6px 24px rgba(0,0,0,.16));color:var(--dsw-alias-label-primary,#1f1f1f);font:12px/1.5 var(--ds-font-family-code,"SF Mono",Consolas,monospace);pointer-events:none;white-space:pre-wrap;word-break:break-word;overflow-y:auto}',
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
      // Only one conversation viewport is mounted at a time; revisit if DSH
      // ever renders multiple sessions side by side.
      return document.querySelector(SCROLL_SEL)
    }

    function previewText(row) {
      try {
        return (row.innerText || '').replace(/\s+/g, ' ').trim()
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
      this.inner = null
      this.syncHint = null
      this.activeIndex = 0
      this.anchors = []
      this.list = null
      this.observer = null
      this.previewEl = null
      this.highlightTimer = null
      this.fisheyeRaf = false
      this.onRailMoveBound = null
      this.onRailLeaveBound = null
      this.jumpedDot = null
      this.resetTimer = null
      this.wasAtBottom = false
      this.ignoreScrollUntil = 0 // resize-anchoring scrolls must not clear the latch
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
        this.onRailMoveBound = this.onRailMove.bind(this)
        this.onRailLeaveBound = this.onRailLeave.bind(this)
        this.rail.addEventListener('pointermove', this.onRailMoveBound)
        this.rail.addEventListener('pointerleave', this.onRailLeaveBound)
        this.onResizeBound = this.onResize.bind(this)
        window.addEventListener('resize', this.onResizeBound)

        var conv = this.sessionConversation()
        if (conv && typeof conv.loadOlder === 'function') {
          this.syncHistory()
        } else {
          this.rebuild()
        }
      } catch (e) {
        console.warn('[dsh-conversation-minimap] attach failed', e)
        this.destroy()
      }
    }

    MinimapController.prototype.findList = function () {
      var first = this.scroll.querySelector(ANCHOR_SEL)
      return first ? first.parentElement : null
    }

    MinimapController.prototype.onResize = function () {
      if (this.disposed) return
      this.ignoreScrollUntil = Date.now() + 500
      this.measureOffsets()
      this.updateShift()
      // A top-anchored window resize (dragging the top edge down) keeps the
      // view at the same content top, leaving the conversation short of the
      // bottom. If the user was at the bottom, snap back after layout settles.
      var self = this
      if (this.wasAtBottom) {
        setTimeout(function () {
          if (self.disposed || !self.scroll) return
          self.scroll.scrollTop = self.scroll.scrollHeight
        }, 300)
      }
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
      if (this.syncing || this.disposed) return
      var self = this
      var conv = this.sessionConversation()
      if (!conv || typeof conv.loadOlder !== 'function') return
      if (!this.list) {
        // Conversation rows not rendered yet — retry shortly (MountManager also
        // re-attaches once rows appear).
        setTimeout(function () { if (!self.disposed && !self.syncing) self.syncHistory() }, 600)
        return
      }
      this.syncing = true
      if (this.syncHint) this.syncHint.style.display = 'block'
      ;(async function () {
        try {
          for (var i = 0; i < SYNC_MAX_PAGES && !self.disposed; i++) {
            var beforeKey = self.firstAnchorKey()
            var beforeH = self.scroll.scrollHeight
            await conv.loadOlder()
            await sleep(SYNC_PAGE_DELAY_MS)
            if (self.disposed) return
            var afterKey = self.firstAnchorKey()
            var afterH = self.scroll.scrollHeight
            // History exhausted only when nothing at all was prepended; a page
            // without user rows still changes scrollHeight.
            if (afterKey === beforeKey && afterH === beforeH) break
          }
        } catch (e) {
          console.warn('[dsh-conversation-minimap] history sync stopped', e)
        } finally {
          if (self.disposed) return
          self.syncing = false
          if (self.syncHint) self.syncHint.style.display = 'none'
          self.anchors = self.collect()
          self.render()
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
      if (this.syncing) return // history still loading — render the full rail once at the end
      try {
        var next = this.collect()
        if (this.sameKeys(next)) return
        // A shrinking anchor set means the conversation window was reset
        // (transient re-render while sending/streaming, or a real re-window).
        // Keep the current rail and re-pull the full history instead of
        // flashing a short rail — if the shrink was transient the rail never
        // flickers; if real, the sync restores every anchor.
        if (next.length < this.anchors.length && this.anchors.length >= MIN_PROMPTS) {
          this.syncHistory()
          return
        }
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
      var shown = this.anchors.length >= MIN_PROMPTS
      this.seat.style.display = shown ? '' : 'none'
      if (!shown) return

      var self = this
      this.measureOffsets()

      this.inner = document.createElement('div')
      this.inner.className = 'dsh-mm-inner'
      for (var i = 0; i < this.anchors.length; i++) {
        var a = this.anchors[i]
        var dot = document.createElement('div')
        dot.className = 'dsh-mm-anchor'
        dot.setAttribute('data-mm-key', a.key)
        ;(function (anchorEl) {
          anchorEl.addEventListener('pointerenter', function () { self.onHover(anchorEl) })
          anchorEl.addEventListener('pointermove', function () { self.onAnchorMove(anchorEl) })
          anchorEl.addEventListener('pointerleave', function () {
            self.hidePreview()
            self.scheduleReset()
          })
        })(dot)
        dot.addEventListener('click', function (ev) { self.onJump(ev.currentTarget) })
        this.inner.appendChild(dot)
        a.anchorEl = dot
        a.pos = 0
        a.height = 0
      }
      this.rail.appendChild(this.inner)
      this.rail.appendChild(this.syncHint)
      this.updatePositions()
      this.updateShift()
    }

    // Anchor-column placement:
    //   - fits the rail -> centered, grows outward from the middle;
    //   - overflows (many prompts / short window) -> the window centers on the
    //     ACTIVE anchor (the current prompt), clamped so no empty space shows:
    //     at the top of the conversation the earliest anchors are visible, at
    //     the bottom the latest ones — the current prompt's anchor is always
    //     in view and never exceeds the rail range (edges fade via the mask).
    MinimapController.prototype.updateShift = function () {
      if (!this.inner || !this.anchors.length) return
      var n = this.anchors.length
      var columnH = n * ANCHOR_H + (n - 1) * ANCHOR_GAP
      var railH = this.rail.getBoundingClientRect().height
      if (!railH) return
      var shift
      if (columnH <= railH) {
        shift = (railH - columnH) / 2
      } else {
        // Window over the column: [w, w + railH], active centered when possible.
        // At the extremes the window extends INSET px past the column ends so the
        // outermost anchors stay clear of the rail-edge fade zones (fully visible).
        var INSET = FADE_SOLID + 6 // keep the outermost anchors clear of the fade zone
        var activeCenter = this.activeIndex * (ANCHOR_H + ANCHOR_GAP) + ANCHOR_H / 2
        var overflow = columnH - railH
        var w = Math.max(-INSET, Math.min(overflow + INSET, activeCenter - railH / 2))
        shift = -w // moving the column UP reveals later anchors
      }
      this.inner.style.transform = 'translateY(' + Math.round(shift) + 'px)'
    }

    // Content origin relative to the SCROLLER (the list element can sit inside
    // sticky wrappers whose viewport offset is not the content origin).
    MinimapController.prototype.scrollerOrigin = function () {
      var sr = this.scroll.getBoundingClientRect()
      return { srTop: sr.top, st: this.scroll.scrollTop }
    }

    // Align the rail with the visible conversation area: below the session
    // header and above the composer, so no anchor is hidden.
    MinimapController.prototype.measureOffsets = function () {
      try {
        var root = this.parent
        var rootRect = root.getBoundingClientRect()
        var scrollRect = this.scroll.getBoundingClientRect()
        var headerH = Math.max(scrollRect.top - rootRect.top, 0)
        var composerEl = this.scroll.querySelector('[data-composer-seat]')
        var composerH = composerEl ? composerEl.getBoundingClientRect().height : 0
        if (!composerH) {
          var v = getComputedStyle(this.scroll).getPropertyValue('--dsh-composer-height')
          composerH = parseFloat(v) || 152
        }
        var top = headerH + 8
        var bottom = composerH + 16
        var railH = rootRect.height - top - bottom
        if (railH < MIN_RAIL_H) {
          // Very short window: keep a usable rail instead of collapsing to 0.
          railH = MIN_RAIL_H
          bottom = Math.max(0, rootRect.height - top - railH)
        }
        // The seat is the positioned box at the rail bounds; the rail fills it
        // (offsets relative to the seat, not the root — no double offset).
        this.seat.style.top = top + 'px'
        this.seat.style.bottom = bottom + 'px'
        this.rail.style.top = '0px'
        this.rail.style.bottom = '0px'
      } catch (e) { /* keep previous offsets */ }
    }

    MinimapController.prototype.updatePositions = function () {
      if (!this.list) return
      var m = this.scrollerOrigin()
      for (var i = 0; i < this.anchors.length; i++) {
        var rect = this.anchors[i].row.getBoundingClientRect()
        this.anchors[i].pos = rect.top - m.srTop + m.st
        this.anchors[i].height = rect.height
      }
      this.updateActive()
    }

    // GPT-style fish-eye: bar widths follow a bell curve around the cursor.
    // Free tracking over the rail; while the pointer stays inside an enlarged
    // bar, the peak is pinned to that bar's center (sticky), and leaving the
    // rail only schedules a short delayed reset — the effect never pops away
    // while the mouse is still within the enlarged region.
    MinimapController.prototype.onRailMove = function (ev) {
      var self = this
      if (this.resetTimer) { clearTimeout(this.resetTimer); this.resetTimer = null }
      if (this.fisheyeRaf) return
      this.fisheyeRaf = true
      requestAnimationFrame(function () {
        self.fisheyeRaf = false
        if (self.disposed) return
        self.applyFishEye(ev.clientY)
      })
    }

    MinimapController.prototype.onAnchorMove = function (anchorEl) {
      var self = this
      if (this.resetTimer) { clearTimeout(this.resetTimer); this.resetTimer = null }
      if (this.fisheyeRaf) return
      this.fisheyeRaf = true
      requestAnimationFrame(function () {
        self.fisheyeRaf = false
        if (self.disposed) return
        var r = anchorEl.getBoundingClientRect()
        var y = r.top + r.height / 2
        self.applyFishEye(y)
      })
    }

    MinimapController.prototype.applyFishEye = function (y) {
      try {
        for (var i = 0; i < this.anchors.length; i++) {
          var el = this.anchors[i].anchorEl
          if (!el) continue
          var r = el.getBoundingClientRect()
          var d = Math.abs(r.top + r.height / 2 - y)
          var w = BASE_W + (PEAK_W - BASE_W) * Math.exp(-(d * d) / (2 * FISHEYE_SIGMA * FISHEYE_SIGMA))
          el.style.width = Math.round(w) + 'px'
          el.classList.toggle('dsh-mm-hot', d < 6)
          el.classList.toggle('dsh-mm-enlarged', w > BASE_W + 4)
        }
      } catch (e) { /* ignore */ }
    }

    MinimapController.prototype.scheduleReset = function () {
      var self = this
      if (this.resetTimer) clearTimeout(this.resetTimer)
      this.resetTimer = setTimeout(function () {
        self.resetTimer = null
        if (self.disposed) return
        self.resetFishEye()
      }, 250)
    }

    MinimapController.prototype.resetFishEye = function () {
      for (var i = 0; i < this.anchors.length; i++) {
        var el = this.anchors[i].anchorEl
        if (el) {
          el.style.width = ''
          el.classList.remove('dsh-mm-hot', 'dsh-mm-enlarged')
        }
      }
    }

    MinimapController.prototype.onRailLeave = function () {
      this.scheduleReset()
      this.hidePreview()
    }

    MinimapController.prototype.onScroll = function () {
      var self = this
      try {
        // Scroll events fired while a resize is settling are browser/DSH scroll
        // anchoring, not user scrolling — keep the bottom latch intact.
        if (Date.now() >= this.ignoreScrollUntil) {
          this.wasAtBottom = this.scroll.scrollTop + this.scroll.clientHeight >= this.scroll.scrollHeight - 40
        }
      } catch (e) { /* ignore */ }
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
      // Switch the active anchor when the prompt's vertical center crosses the
      // viewport's vertical center (not as soon as it peeks at the top).
      var center = this.scroll.scrollTop + this.scroll.clientHeight / 2
      var active = 0
      for (var i = 0; i < this.anchors.length; i++) {
        if (this.anchors[i].pos + this.anchors[i].height / 2 <= center) active = i
      }
      this.activeIndex = active
      for (var j = 0; j < this.anchors.length; j++) {
        var el = this.anchors[j].anchorEl
        if (el) el.classList.toggle('dsh-mm-active', j === active)
      }
      this.updateShift()
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
        // Never leave a green dot behind: clear any previous jump state first.
        if (this.jumpedDot && this.jumpedDot !== dot) {
          this.jumpedDot.classList.remove('dsh-mm-jumped')
        }
        dot.classList.add('dsh-mm-jumped')
        this.jumpedDot = dot
        if (this.highlightTimer) clearTimeout(this.highlightTimer)
        var target = a // captured per-jump (break stops reassignment)
        this.highlightTimer = setTimeout(function () {
          target.row.classList.add('dsh-mm-fade')
          setTimeout(function () {
            target.row.classList.remove('dsh-mm-jump-highlight', 'dsh-mm-fade')
            dot.classList.remove('dsh-mm-jumped')
            if (self.jumpedDot === dot) self.jumpedDot = null
          }, 300)
        }, HIGHLIGHT_MS)
        break
      }
    }

    MinimapController.prototype.destroy = function () {
      if (this.disposed) return
      this.disposed = true
      if (this.highlightTimer) clearTimeout(this.highlightTimer)
      if (this.resetTimer) clearTimeout(this.resetTimer)
      if (this.observer) this.observer.disconnect()
      if (this.scroll && this.onScrollBound) this.scroll.removeEventListener('scroll', this.onScrollBound)
      if (this.rail && this.onRailMoveBound) this.rail.removeEventListener('pointermove', this.onRailMoveBound)
      if (this.rail && this.onRailLeaveBound) this.rail.removeEventListener('pointerleave', this.onRailLeaveBound)
      if (this.onResizeBound) window.removeEventListener('resize', this.onResizeBound)
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
      if (!ENABLED) return // master switch off — do not mount
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
