/* Lecteur de musique du site : joue /music/la-vida-carousel.mp3 (s'il existe) en boucle. */
(function () {
  var SRC = '/music/la-vida-carousel.mp3';
  var TITLE = 'La Vida Carousel';
  var SUB = 'Funk brésilien';
  var K_OFF = 'epx_music_off';
  var K_POS = 'epx_music_pos';
  var K_VOL = 'epx_music_vol';

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var css = [
    '#epx-player{position:fixed;right:16px;bottom:16px;z-index:60;display:none;align-items:center;gap:10px;',
    'padding:8px 14px 8px 8px;border-radius:999px;background:rgba(7,11,31,.9);border:1px solid #14307a;',
    'backdrop-filter:blur(8px);box-shadow:0 10px 30px rgba(0,0,0,.5),0 0 22px rgba(53,215,255,.25);',
    'font-family:Inter,system-ui,sans-serif;color:#d6efff}',
    '#epx-player.show{display:flex}',
    '#epx-player button{all:unset;cursor:pointer;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;',
    'background:linear-gradient(135deg,#1f6bff,#35d7ff);color:#00103a;font-size:16px;font-weight:800;flex:none}',
    '#epx-player button:focus-visible{outline:2px solid #fff;outline-offset:2px}',
    '#epx-player .t{line-height:1.2;min-width:0}',
    '#epx-player .t b{display:block;font-size:13px;white-space:nowrap}',
    '#epx-player .t span{font-size:11px;color:#7f92c4;white-space:nowrap}',
    '#epx-player .eq{display:flex;align-items:flex-end;gap:2px;height:18px}',
    '#epx-player .eq i{width:3px;height:4px;border-radius:2px;background:#35d7ff;transition:height .2s}',
    '#epx-player.on .eq i{animation:epxeq .9s ease-in-out infinite}',
    '#epx-player.on .eq i:nth-child(2){animation-delay:.15s}',
    '#epx-player.on .eq i:nth-child(3){animation-delay:.3s}',
    '#epx-player.on .eq i:nth-child(4){animation-delay:.45s}',
    '@keyframes epxeq{0%,100%{height:4px}50%{height:18px}}',
    '#epx-player input[type=range]{width:70px;accent-color:#35d7ff}',
    '@media(max-width:520px){#epx-player .t,#epx-player input[type=range]{display:none}#epx-player{padding:6px 10px 6px 6px}}',
    '@media(prefers-reduced-motion:reduce){#epx-player.on .eq i{animation:none;height:10px}}'
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var root = document.createElement('div');
  root.id = 'epx-player';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Lecteur de musique');
  root.innerHTML =
    '<button type="button" aria-label="Lecture / pause">▶</button>' +
    '<div class="t"><b></b><span></span></div>' +
    '<div class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
    '<input type="range" min="0" max="100" aria-label="Volume">';
  root.querySelector('b').textContent = TITLE;
  root.querySelector('.t span').textContent = SUB;
  document.body.appendChild(root);

  var btn = root.querySelector('button');
  var vol = root.querySelector('input');
  var audio = new Audio();
  audio.loop = true;
  audio.preload = 'auto';

  var v = parseFloat(get(K_VOL));
  if (isNaN(v)) v = 0.5;
  audio.volume = v;
  vol.value = Math.round(v * 100);
  vol.addEventListener('input', function () {
    audio.volume = vol.value / 100;
    set(K_VOL, String(audio.volume));
  });

  function ui() {
    var playing = !audio.paused;
    btn.textContent = playing ? '❚❚' : '▶';
    root.classList.toggle('on', playing);
  }
  audio.addEventListener('play', ui);
  audio.addEventListener('pause', ui);

  function tryPlay() {
    var p = audio.play();
    return p && p.then ? p.then(function () { return true; }, function () { return false; }) : Promise.resolve(true);
  }

  function armFirstGesture() {
    var evs = ['pointerdown', 'keydown', 'touchstart'];
    function go() {
      evs.forEach(function (e) { window.removeEventListener(e, go, true); });
      if (get(K_OFF) !== '1' && audio.paused) tryPlay();
    }
    evs.forEach(function (e) { window.addEventListener(e, go, true); });
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (audio.paused) { set(K_OFF, '0'); tryPlay(); }
    else { set(K_OFF, '1'); audio.pause(); }
  });

  // On ne montre le lecteur que si le fichier audio existe vraiment.
  audio.addEventListener('error', function () { root.remove(); });
  audio.addEventListener('loadedmetadata', function () {
    root.classList.add('show');
    var pos = parseFloat(get(K_POS));
    if (pos > 0 && pos < audio.duration - 1) { try { audio.currentTime = pos; } catch (e) {} }
    if (get(K_OFF) !== '1') tryPlay().then(function (ok) { if (!ok) armFirstGesture(); });
    ui();
  });

  var last = 0;
  audio.addEventListener('timeupdate', function () {
    var now = Date.now();
    if (now - last > 1000) { last = now; set(K_POS, String(audio.currentTime)); }
  });
  window.addEventListener('pagehide', function () { set(K_POS, String(audio.currentTime)); });

  // On demande au serveur quel fichier audio existe (le nom n'a plus d'importance)
  fetch('/api/music', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (d) { audio.src = (d && d.src) || SRC; })
    .catch(function () { audio.src = SRC; });
})();
