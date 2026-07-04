/* LP秘書 計測スクリプト(自前・GA不要)
 * 使い方: <script src="https://HOST/t.js" data-site="SLUG" data-version="1" defer></script>
 * タグ版(Light)は data-endpoint で送信先を明示できる。
 * 取得: pageview / scroll(25,50,75,100%) / section_view / section_dwell / cta_click
 * 個人情報・クロスサイト追跡なし(自ドメイン一次配信・localStorageのみ)。
 */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var site = s.getAttribute("data-site");
  if (!site) return;
  var ver = s.getAttribute("data-version") || "";
  var endpoint = s.getAttribute("data-endpoint");
  if (!endpoint) {
    try {
      endpoint = new URL(s.src).origin + "/api/track";
    } catch (e) {
      endpoint = "/api/track";
    }
  }

  function rid() {
    return (
      Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
    );
  }

  var vid, sid;
  try {
    vid = localStorage.getItem("lph_vid");
    if (!vid) {
      vid = rid();
      localStorage.setItem("lph_vid", vid);
    }
  } catch (e) {
    vid = rid();
  }
  try {
    sid = sessionStorage.getItem("lph_sid");
    if (!sid) {
      sid = rid();
      sessionStorage.setItem("lph_sid", sid);
    }
  } catch (e) {
    sid = rid();
  }

  var query = {};
  try {
    new URLSearchParams(location.search).forEach(function (v, k) {
      query[k] = v;
    });
  } catch (e) {}

  var queue = [];

  function push(type, extra) {
    var ev = { t: type, ts: Date.now() };
    if (extra) {
      for (var k in extra) ev[k] = extra[k];
    }
    queue.push(ev);
    if (queue.length >= 12) flush();
  }

  function flush() {
    if (!queue.length) return;
    var payload = JSON.stringify({
      site: site,
      v: ver,
      vid: vid,
      sid: sid,
      url: location.href.split("?")[0],
      ref: document.referrer || "",
      q: query,
      events: queue.splice(0),
    });
    var sent = false;
    if (navigator.sendBeacon) {
      sent = navigator.sendBeacon(endpoint, payload);
    }
    if (!sent) {
      fetch(endpoint, { method: "POST", body: payload, keepalive: true }).catch(
        function () {}
      );
    }
  }

  // --- pageview ---
  push("pageview");

  // --- scroll depth ---
  var marks = [25, 50, 75, 100];
  var seen = {};
  function onScroll() {
    var doc = document.documentElement;
    var total = doc.scrollHeight - window.innerHeight;
    var pct =
      total <= 0 ? 100 : Math.round(((doc.scrollTop || window.scrollY) / total) * 100);
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      if (pct >= m && !seen[m]) {
        seen[m] = 1;
        push("scroll", { val: m });
      }
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // --- sections (view + dwell) ---
  var timers = {};
  function flushDwell(id) {
    var t = timers[id];
    if (t && t.t0) {
      push("section_dwell", { s: id, val: Date.now() - t.t0 });
      t.t0 = 0;
    }
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var id = entry.target.getAttribute("data-lph-section");
          if (!id) return;
          if (entry.isIntersecting) {
            if (!timers[id]) timers[id] = { t0: 0, viewed: 0 };
            timers[id].t0 = Date.now();
            if (!timers[id].viewed) {
              timers[id].viewed = 1;
              push("section_view", { s: id });
            }
          } else {
            flushDwell(id);
          }
        });
      },
      { threshold: 0.5 }
    );
    document.querySelectorAll("[data-lph-section]").forEach(function (el) {
      io.observe(el);
    });
  }

  // --- CTA clicks ---
  document.addEventListener(
    "click",
    function (ev) {
      var target = ev.target;
      if (!target || !target.closest) return;
      var a = target.closest("[data-lph-cta]");
      if (a) {
        push("cta_click", {
          s: a.getAttribute("data-lph-cta") || "cta",
          m: { href: a.getAttribute("href") || "" },
        });
        flush(); // LINE遷移で離脱する前に送る
      }
    },
    true
  );

  // --- flush timing ---
  setInterval(flush, 5000);
  window.addEventListener("pagehide", function () {
    for (var id in timers) flushDwell(id);
    flush();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      for (var id in timers) flushDwell(id);
      flush();
    }
  });
})();
