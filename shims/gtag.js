// Pulse Observer page-safe shim for the Google tag family (gtag.js,
// analytics.js, gtm.js). Served locally via a DNR redirect in place of the
// real script: the page sees the API surface it expects — globals defined,
// queues drained, callbacks fired — so nothing breaks, while no request
// ever reaches Google. This file must stay dependency-free and idempotent:
// pages sometimes load the tag twice, and inline snippets may have already
// created the command queues before this runs.
;(() => {
  "use strict"
  const w = window

  const callSoon = (fn) => {
    if (typeof fn === "function") setTimeout(fn, 1)
  }

  // Pages gate flows on these callbacks (e.g. form submit handlers that
  // navigate from event_callback / hitCallback). Firing them is the whole
  // point of the shim.
  const fireCallbacks = (args) => {
    for (const arg of args) {
      if (typeof arg === "function") callSoon(arg)
      else if (arg && typeof arg === "object") {
        callSoon(arg.event_callback)
        callSoon(arg.hitCallback)
      }
    }
  }

  // --- gtag.js / gtm.js: dataLayer + gtag ---
  w.dataLayer = w.dataLayer || []
  const drainDataLayerEntry = (entry) => {
    if (entry && typeof entry === "object") {
      callSoon(entry.eventCallback)
      fireCallbacks([entry])
    }
  }
  // Drain anything queued before the shim loaded, then keep draining.
  for (const entry of w.dataLayer) drainDataLayerEntry(entry)
  const push = w.dataLayer.push.bind(w.dataLayer)
  w.dataLayer.push = function () {
    for (const entry of arguments) drainDataLayerEntry(entry)
    return push.apply(null, arguments)
  }

  if (typeof w.gtag !== "function" || !w.gtag.__pulseShim) {
    const gtag = function () {
      fireCallbacks(arguments)
      w.dataLayer.push(arguments)
    }
    gtag.__pulseShim = true
    w.gtag = gtag
  }

  // GTM signals "container loaded" through this object; consent tools and
  // some tag-gated pages poll it.
  w.google_tag_manager = w.google_tag_manager || {}
  w.google_tag_data = w.google_tag_data || {}

  // --- analytics.js: the ga command queue ---
  const makeTracker = () => ({
    get: () => "",
    set: () => undefined,
    send: function () {
      fireCallbacks(arguments)
    }
  })
  if (typeof w.ga !== "function" || !w.ga.__pulseShim) {
    const pending = (w.ga && w.ga.q) || []
    const ga = function () {
      fireCallbacks(arguments)
      const ready = [...arguments].find((arg) => typeof arg === "function")
      if (ready) callSoon(() => ready(makeTracker()))
    }
    ga.__pulseShim = true
    ga.q = []
    ga.l = Date.now()
    ga.create = makeTracker
    ga.getAll = () => [makeTracker()]
    ga.getByName = makeTracker
    ga.remove = () => undefined
    ga.loaded = true
    w.ga = ga
    for (const args of pending) ga.apply(null, args)
  }
  w.GoogleAnalyticsObject = w.GoogleAnalyticsObject || "ga"
})()
