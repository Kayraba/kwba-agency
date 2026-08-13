/* ============================================================
   KWBA Studio — shared behaviour
   Mobile menu, scroll reveals, and the enquiry form pipeline.
   Every page that needs one of these just includes this file.
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Mobile menu ---------------------------------------------------- */
  function initMenu() {
    var toggle = document.getElementById('nav-toggle');
    var menu = document.getElementById('mobile-menu');
    if (!toggle || !menu) return;
    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    menu.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---- Scroll reveals + count-ups -------------------------------------- */
  function initReveals() {
    var els = document.querySelectorAll('.reveal, [data-count]');
    if (!els.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        if (e.target.dataset.count) countUp(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.15 });
    els.forEach(function (el) { io.observe(el); });
  }

  function countUp(el) {
    var target = parseFloat(el.dataset.count);
    var prefix = el.dataset.prefix || '', suffix = el.dataset.suffix || '';
    if (reduced) { el.textContent = prefix + target + suffix; return; }
    var t0 = performance.now(), dur = 1400;
    (function tick(t) {
      var k = Math.min((t - t0) / dur, 1), eased = 1 - Math.pow(1 - k, 3);
      el.textContent = prefix + Math.round(target * eased) + suffix;
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }

  /* ---- Enquiry form ---------------------------------------------------- */
  /* Formspree is the source of truth — it works from static hosting and is
     what brief.html already uses. The KWBA API sync is best effort so a
     sleeping backend can never cost us the enquiry. */
  var FORMSPREE = 'https://formspree.io/f/xpwzgkdl';

  function initForm() {
    var form = document.getElementById('form-fields');
    if (!form) return;
    var btn = document.getElementById('form-btn');
    var errEl = document.getElementById('form-error');
    var okEl = document.getElementById('form-success');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errEl.style.display = 'none';

      function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
      var name = val('f-name'), email = val('f-email'), idea = val('f-idea');
      var service = val('f-service'), message = val('f-message'), trap = val('f-company');

      if (!name || !email || !idea) {
        errEl.textContent = 'Please fill in your name, email, and idea.';
        errEl.style.display = 'block';
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errEl.textContent = 'Please enter a valid email address.';
        errEl.style.display = 'block';
        return;
      }
      if (trap) return; /* honeypot */

      var label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending…';

      fetch(FORMSPREE, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _subject: 'New enquiry — ' + idea + ' (' + (service || 'unspecified') + ')',
          name: name, email: email, idea: idea,
          service: service || 'Not specified',
          message: message || '—'
        })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('send failed');
          return fetch((window.API_BASE || '') + '/public-brief', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: String(Date.now()),
              briefType: 'platform-enquiry',
              timestamp: new Date().toISOString(),
              bizName: idea,
              contactName: name,
              cEmail: email,
              service: service || 'Not specified',
              message: message || '—',
              source: document.body.dataset.formSource || 'website'
            })
          }).catch(function () {});
        })
        .then(function () {
          form.style.display = 'none';
          okEl.style.display = 'block';
          okEl.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = label;
          errEl.innerHTML = 'Something went wrong. Please try again or email ' +
            '<a href="mailto:hello@kwba-agency.com">hello@kwba-agency.com</a>.';
          errEl.style.display = 'block';
        });
    });
  }

  /* ---- Preselect a service from ?service= or a data-service link ------- */
  function initServicePreselect() {
    var sel = document.getElementById('f-service');
    if (!sel) return;
    function pick(want) {
      if (!want) return;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].text === want) { sel.selectedIndex = i; return; }
      }
    }
    pick(new URLSearchParams(location.search).get('service'));
    document.querySelectorAll('[data-service]').forEach(function (el) {
      el.addEventListener('click', function () { pick(el.dataset.service); });
    });
  }

  function boot() {
    initMenu();
    initReveals();
    initForm();
    initServicePreselect();
    document.querySelectorAll('[data-year]').forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
