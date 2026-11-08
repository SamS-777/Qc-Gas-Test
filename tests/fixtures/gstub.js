/* Faux Google Maps JavaScript pour les tests (classes et signatures selon la référence publique).
   MODE (OK, AUTHFAIL, AUTHONLY, QUOTA) et CB (nom du callback) sont injectés par le test avant ce code. */
(function () {
  const calls = (window.__gcalls = []);
  const hv = (a, b) => { const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lng - a.lng) * r; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(x)); };
  const lit = p => (p.location ? p.location : p);
  class LatLng { constructor(a, b) { if (typeof a === "object") { this._a = a.lat; this._b = a.lng; } else { this._a = a; this._b = b; } } lat() { return this._a; } lng() { return this._b; } }
  class LatLngBounds { constructor() { this.n = 0; } extend() { this.n++; return this; } }
  class Point { constructor(x, y) { this.x = x; this.y = y; } }
  class Size { constructor(w, h) { this.width = w; this.height = h; } }
  class MVC {
    setMap(m) {
      const was = this.map; this.map = m;
      if (m && this.onAdd && !was) { this.onAdd(); if (this.draw) this.draw(); }
      if (!m && was && this.onRemove) this.onRemove();
    }
    addListener(ev, fn) { ((this._l = this._l || {})[ev] = this._l[ev] || []).push(fn); return { remove() {} }; }
    trigger(ev, arg) { ((this._l && this._l[ev]) || []).forEach(fn => fn(arg)); }
  }
  class Map extends MVC {
    constructor(el, opts) {
      super(); this.el = el; this.opts = opts; this.zoom = opts.zoom;
      el.innerHTML = '<div style="position:relative;width:100%;height:100%;background:repeating-linear-gradient(45deg,#e8e4da 0 12px,#efece4 12px 24px)"><div class="gpanes" style="position:absolute;inset:0;overflow:hidden"></div></div>';
      window.__gmap = this; calls.push(["Map", (opts.styles || []).length]);
    }
    setOptions(o) { Object.assign(this.opts, o); calls.push(["setOptions", (o.styles || []).length]); }
    fitBounds(b, pad) { calls.push(["fitBounds", b.n, pad]); }
    panTo() { calls.push(["panTo"]); }
    getZoom() { return this.zoom; }
    getCenter() { return new LatLng(45.55, -73.6); }
    setZoom(z) { this.zoom = z; }
  }
  class Polyline extends MVC {
    constructor(o) { super(); this.o = o; this.map = o.map; (window.__polys = window.__polys || []).push(this); calls.push(["Polyline", o.strokeColor, o.path.length, o.zIndex, o.clickable]); }
    setMap(m) { this.map = m; if (!m) window.__polys = window.__polys.filter(x => x !== this); }
  }
  class Circle extends MVC { constructor(o) { super(); this.map = o.map; calls.push(["Circle", o.radius]); } setMap(m) { this.map = m; } setCenter() {} setRadius() {} }
  class Polygon extends MVC { constructor(o) { super(); this.o = o; this.map = o.map; calls.push(["Polygon", (o.paths || []).length]); } setMap(m) { this.map = m; } }
  class InfoWindow { constructor(o) { this.o = o; } setOptions(o) { Object.assign(this.o, o); } setContent(c) { this.c = c; } setPosition(p) { this.p = p; } open(o) { calls.push(["InfoWindow.open", this.c && this.c.textContent]); } close() {} }
  class OverlayView extends MVC {
    getPanes() { return { overlayMouseTarget: this.map.el.querySelector(".gpanes") }; }
    getProjection() { return {
      fromLatLngToDivPixel: ll => ({ x: (ll.lng() + 73.70) * 3000, y: (45.62 - ll.lat()) * 3000 }),
      fromContainerPixelToLatLng: pt => new LatLng(45.62 - pt.y / 3000, pt.x / 3000 - 73.70),
    }; }
  }
  OverlayView.preventMapHitsAndGesturesFrom = () => {};
  const Route = {
    async computeRoutes(req) {
      calls.push(["computeRoutes", req.routingPreference, req.travelMode, (req.intermediates || []).length, req.computeAlternativeRoutes, (req.fields || []).join(",")]);
      if (MODE === "QUOTA") { const e = new Error("RESOURCE_EXHAUSTED: Quota exceeded for quota metric 'Compute Routes Pro'"); e.code = "RESOURCE_EXHAUSTED"; throw e; }
      if (!req.fields || !req.fields.length) throw new Error("INVALID_ARGUMENT: field mask required");
      const pts = [req.origin, ...(req.intermediates || []).map(lit), req.destination];
      let d = 0; for (let i = 1; i < pts.length; i++) d += hv(pts[i - 1], pts[i]) * 1.35;
      const mk = (f, desc, bend) => {
        const a = req.origin, b = req.destination, n = 20, path = [];
        for (let i = 0; i <= n; i++) { const t = i / n; path.push({ lat: a.lat + (b.lat - a.lat) * t + Math.sin(Math.PI * t) * bend, lng: a.lng + (b.lng - a.lng) * t, altitude: 0 }); }
        return { distanceMeters: d * 1000 * f, durationMillis: d / 30 * 3600000 * f, staticDurationMillis: d / 36 * 3600000 * f, description: desc, path };
      };
      if (req.intermediates && req.intermediates.length) return { routes: [{ distanceMeters: d * 1000, durationMillis: d / 30 * 3600000 }] };
      return { routes: req.computeAlternativeRoutes ? [mk(1, "A-40 E et Rue D'Iberville", 0), mk(1.12, "Boulevard Pie-IX", 0.01)] : [mk(1, "A-40 E", 0)] };
    },
  };
  window.google = { maps: { importLibrary: async name => {
    calls.push(["importLibrary", name]);
    if (name === "maps") return { Map, Polyline, Polygon, Circle, InfoWindow, OverlayView };
    if (name === "core") return { LatLng, LatLngBounds, Size, Point };
    if (name === "routes") return { Route };
    throw new Error("unknown library " + name);
  } } };
  setTimeout(() => {
    if (MODE === "AUTHONLY") { window.gm_authFailure && window.gm_authFailure(); return; } // refus sans callback de succès
    window[CB]();
    if (MODE === "AUTHFAIL") setTimeout(() => window.gm_authFailure && window.gm_authFailure(), 150);
  }, 30);
})();
