/* ─────────────────────────────────────────────────────────────────────────
   KWBA — Parallax + Scroll Effects v2
   Drives: parallax orbs, scroll progress, reveal-on-scroll, nav state,
           card hover glow, stat counters, watermark drift.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* ── Scroll progress bar ─────────────────────────────────────────────── */
  var sp = document.getElementById('sp');
  function updateProgress() {
    if (!sp) return;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    sp.style.width = max > 0 ? (window.scrollY / max * 100) + '%' : '0%';
  }

  /* ── Nav scroll state ────────────────────────────────────────────────── */
  var nav = document.getElementById('nav');
  function updateNav() {
    if (!nav) return;
    nav.classList.toggle('scrolled', window.scrollY > 40);
  }

  function updateParallax() {}

  /* ── Reveal on scroll ────────────────────────────────────────────────── */
  var revealItems = Array.prototype.slice.call(document.querySelectorAll('.reveal-item, .reveal'));
  function revealEl(el) { el.classList.add('in'); }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          revealEl(e.target);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0, rootMargin: '0px 0px 20px 0px' });
    revealItems.forEach(function (el) { io.observe(el); });
  } else {
    revealItems.forEach(revealEl);
  }
  /* Safety net — anything still hidden after 1.5s gets revealed */
  setTimeout(function () {
    revealItems.forEach(function (el) {
      if (!el.classList.contains('in')) revealEl(el);
    });
  }, 1500);

  /* ── Card hover glow (mouse tracking) ───────────────────────────────── */
  if (!reduced) {
    var glowTargets = 'article.svc,.tier,.insight,.testimonial,.pcard';
    document.addEventListener('mousemove', function (e) {
      var card = e.target.closest(glowTargets);
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* ── Stat counter animation ──────────────────────────────────────────── */
  function animateCounters() {
    var stats = Array.prototype.slice.call(document.querySelectorAll('.hero-stat-value'));
    stats.forEach(function (el) {
      var text = el.textContent.trim();
      var match = text.match(/^([£$]?)(\d+)(\+?)(.*)$/);
      if (!match) return;
      var prefix = match[1], target = parseInt(match[2], 10), suffix = match[3] + match[4];
      if (isNaN(target) || reduced) return;
      var start = 0, duration = 1200, startTime = null;
      function step(ts) {
        if (!startTime) startTime = ts;
        var progress = Math.min((ts - startTime) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = prefix + Math.round(start + eased * (target - start)) + suffix;
        if (progress < 1) requestAnimationFrame(step);
      }
      if ('IntersectionObserver' in window) {
        var cio = new IntersectionObserver(function (entries) {
          if (entries[0].isIntersecting) { requestAnimationFrame(step); cio.disconnect(); }
        }, { threshold: 0.5 });
        cio.observe(el);
      } else {
        requestAnimationFrame(step);
      }
    });
  }
  animateCounters();

  /* ── RAF scroll loop ─────────────────────────────────────────────────── */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      updateProgress();
      updateNav();
      updateParallax();
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  updateProgress();
  updateNav();
  updateParallax();
})();
