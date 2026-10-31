(() => {
  "use strict";
  if (window.__academicFocusMusicLoaded) return;
  window.__academicFocusMusicLoaded = true;

  const chords = [
    [261.63, 329.63, 392.00, 493.88],
    [220.00, 261.63, 329.63, 392.00],
    [174.61, 220.00, 261.63, 329.63],
    [196.00, 246.94, 293.66, 392.00]
  ];
  let context = null, master = null, timer = null, chordIndex = 0, playing = false;
  const voices = [];

  function makePlayer() {
    if (document.querySelector(".focus-music")) return;
    const panel = document.createElement("aside");
    panel.className = "focus-music";
    panel.setAttribute("aria-label", "Focus music player");
    panel.innerHTML = '<div class="focus-music-copy"><span class="focus-music-dot" aria-hidden="true"></span><div><strong>Focus music</strong><small class="focus-music-status" aria-live="polite">Soft ambient sounds</small></div></div><div class="focus-music-controls"><button class="focus-music-toggle" type="button" aria-pressed="false">▶ Play</button><label class="focus-music-volume"><span class="sr-only">Music volume</span><input type="range" min="0" max="0.22" step="0.01" value="0.08" aria-label="Music volume"></label></div>';
    document.body.append(panel);
    const toggle = panel.querySelector(".focus-music-toggle");
    const status = panel.querySelector(".focus-music-status");
    const volume = panel.querySelector('input[type="range"]');

    function updateUi() {
      toggle.textContent = playing ? "Ⅱ Pause" : "▶ Play";
      toggle.setAttribute("aria-pressed", String(playing));
      status.textContent = playing ? "Playing · gentle ambient" : "Soft ambient sounds";
      panel.classList.toggle("is-playing", playing);
    }
    function playChord() {
      if (!context || !master || !playing) return;
      const now = context.currentTime;
      const notes = chords[chordIndex++ % chords.length];
      voices.forEach((voice, i) => {
        const frequency = notes[i];
        voice.oscillator.frequency.cancelScheduledValues(now);
        voice.oscillator.frequency.setTargetAtTime(frequency, now, 1.8);
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(i === 0 ? 0.24 : 0.12, now, 2.2);
      });
      timer = window.setTimeout(playChord, 9000);
    }
    async function start() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        status.textContent = "Audio is not supported in this browser";
        return;
      }
      try {
        if (!context || context.state === "closed") {
          context = new AudioContextClass();
          master = context.createGain();
          const filter = context.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.value = 950;
          master.gain.value = 0;
          master.connect(filter);
          filter.connect(context.destination);
          [0, 1, 2, 3].forEach((i) => {
            const oscillator = context.createOscillator();
            const voiceGain = context.createGain();
            oscillator.type = i === 0 ? "sine" : "triangle";
            oscillator.frequency.value = chords[0][i];
            voiceGain.gain.value = 0;
            oscillator.connect(voiceGain);
            voiceGain.connect(master);
            oscillator.start();
            voices.push({ oscillator, gain: voiceGain });
          });
        }
        await context.resume();
        playing = true;
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setTargetAtTime(Number(volume.value), context.currentTime, 1.4);
        playChord();
        updateUi();
      } catch (error) {
        playing = false;
        status.textContent = "Tap play to allow audio";
        updateUi();
      }
    }
    function pause() {
      playing = false;
      if (timer) window.clearTimeout(timer);
      timer = null;
      if (context && master && context.state !== "closed") {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setTargetAtTime(0, context.currentTime, 0.7);
      }
      updateUi();
    }
    toggle.addEventListener("click", () => playing ? pause() : start());
    volume.addEventListener("input", () => {
      if (playing && master && context) {
        master.gain.setTargetAtTime(Number(volume.value), context.currentTime, 0.12);
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && playing) pause();
    });
    window.addEventListener("pagehide", () => {
      if (context && context.state !== "closed") context.close().catch(() => {});
    });
    updateUi();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", makePlayer, { once: true });
  else makePlayer();
})();