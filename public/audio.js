// TTS cliente — Web Speech API (catálogo §B.4 audio).
//
// Esto vive en el navegador, sin coste, sin claves. Funciona en Chrome,
// Edge, Safari y derivados; en Firefox depende de `speechSynthesis`
// (Linux puede no traer voces es-ES por defecto).
//
// Uso desde el resto del frontend:
//   window.__audio.speak("Texto a leer", { rate: 1, voice: "es-ES" })
//   window.__audio.pause() / .resume() / .stop()
//   window.__audio.list() → voces disponibles
//
// Si la API no está disponible, los métodos hacen no-op y `available` es
// false — los componentes que lo usen pueden ocultar el botón "Escuchar".

const audio = (() => {
  const synth = window.speechSynthesis || null;
  const available = !!synth;
  let currentUtter = null;
  let voicesCache = [];

  function loadVoices() {
    if (!available) return [];
    const v = synth.getVoices();
    if (v.length) voicesCache = v;
    return voicesCache;
  }

  if (available) {
    loadVoices();
    // En algunos navegadores las voces llegan async
    synth.onvoiceschanged = loadVoices;
  }

  function pickVoice(preferLang = "es-ES") {
    const list = loadVoices();
    if (!list.length) return null;
    // Preferimos voz nativa de es-ES, luego cualquier es-*, luego default
    return list.find((v) => v.lang === preferLang)
      || list.find((v) => (v.lang || "").startsWith("es"))
      || list.find((v) => v.default)
      || list[0];
  }

  function speak(text, opts = {}) {
    if (!available || !text) return;
    stop(); // detener cualquier locución previa
    const utter = new SpeechSynthesisUtterance(String(text));
    utter.lang = opts.lang || "es-ES";
    utter.rate = Math.max(0.5, Math.min(2, opts.rate || 1));
    utter.pitch = Math.max(0, Math.min(2, opts.pitch || 1));
    utter.volume = Math.max(0, Math.min(1, opts.volume ?? 1));
    const voice = opts.voiceName
      ? loadVoices().find((v) => v.name === opts.voiceName)
      : pickVoice(utter.lang);
    if (voice) utter.voice = voice;
    if (opts.onStart) utter.onstart = opts.onStart;
    if (opts.onEnd) utter.onend = opts.onEnd;
    if (opts.onError) utter.onerror = opts.onError;
    currentUtter = utter;
    synth.speak(utter);
    return utter;
  }

  function pause() { if (available && synth.speaking && !synth.paused) synth.pause(); }
  function resume() { if (available && synth.paused) synth.resume(); }
  function stop() { if (available) synth.cancel(); currentUtter = null; }
  function isSpeaking() { return available && synth.speaking; }
  function isPaused() { return available && synth.paused; }
  function list() { return loadVoices().filter((v) => (v.lang || "").startsWith("es")); }

  return { available, speak, pause, resume, stop, isSpeaking, isPaused, list };
})();

window.__audio = audio;
