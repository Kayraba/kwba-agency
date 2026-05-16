/* ─────────────────────────────────────────────────────────────────────────
   KWBA Ad Engine — JS
   Reads scene durations from data-d attributes, transitions them in order,
   shows a progress bar, replay button at the end.
   ───────────────────────────────────────────────────────────────────────── */
(function(){
  'use strict';

  function play(){
    var scenes  = Array.prototype.slice.call(document.querySelectorAll('.scene'));
    var progress= document.getElementById('progress');
    var replay  = document.getElementById('replay');
    if (!scenes.length) return;

    // Compute total duration
    var total = 0;
    scenes.forEach(function(s){
      s._dur = parseFloat(s.dataset.d) || 2.5;
      total += s._dur;
    });

    // Show first scene immediately
    var startedAt = performance.now();

    function setProgress(elapsed){
      if (!progress) return;
      var pct = Math.min(100, (elapsed / total) * 100);
      progress.style.width = pct + '%';
    }

    function tick(){
      var elapsed = (performance.now() - startedAt) / 1000;
      setProgress(elapsed);

      // Find current scene
      var cum = 0, idx = 0;
      for (var i = 0; i < scenes.length; i++){
        if (elapsed >= cum && elapsed < cum + scenes[i]._dur){
          idx = i; break;
        }
        cum += scenes[i]._dur;
        idx = i + 1;
      }

      if (idx >= scenes.length){
        // Ended
        if (replay) replay.classList.add('show');
        return;
      }

      // Activate the current scene; deactivate the others
      scenes.forEach(function(s, i){
        s.classList.toggle('active', i === idx);
      });

      requestAnimationFrame(tick);
    }

    // Hide replay button at start
    if (replay) replay.classList.remove('show');

    tick();
  }

  function init(){
    play();
    var r = document.getElementById('replay');
    if (r){
      r.addEventListener('click', function(){
        // Restart all scenes — toggle off then on to retrigger CSS animations
        var scenes = document.querySelectorAll('.scene');
        scenes.forEach(function(s){ s.classList.remove('active'); });
        // Force layout reflow
        document.body.offsetHeight;
        play();
      });
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
