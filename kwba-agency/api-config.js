/**
 * KWBA Agency — API endpoint configuration
 * ----------------------------------------------------------------
 * The static frontend (Netlify, kwba-agency.com) does NOT host the
 * Node backend. The backend runs on Render. All login / API calls
 * must hit the Render URL.
 *
 * To change the backend URL, edit this file only.
 */
(function(){
  var hostname = window.location.hostname || '';
  var isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';

  // ─── EDIT THIS LINE if your Render service URL changes ────────────
  var RENDER_API = 'https://kwba-agency.onrender.com';
  // ──────────────────────────────────────────────────────────────────

  if (isLocal){
    // Local dev: assume server.js is running on the same origin
    window.API_BASE = '';
  } else {
    // Anything else (Netlify production, custom domain, preview URL)
    // → hit the Render API explicitly
    window.API_BASE = RENDER_API;
  }
})();
