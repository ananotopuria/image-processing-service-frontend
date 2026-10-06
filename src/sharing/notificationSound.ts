export function createNotificationSound() {
  if (typeof Audio === "undefined") return { play() {}, dispose() {} };

  const audio = new Audio(`${import.meta.env.BASE_URL}sounds/notification.wav`);
  audio.preload = "auto";
  audio.volume = 0.55;
  let disposed = false;
  let busy = false;
  let pending = 0;

  const removeInteractionListeners = () => {
    window.removeEventListener("pointerup", unlock);
    window.removeEventListener("keydown", unlock);
  };
  const reset = () => {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    busy = false;
  };
  const failed = () => {
    // Drop blocked activity rather than replaying old notifications on interaction.
    pending = 0;
    reset();
  };
  async function start(silent: boolean) {
    busy = true;
    try {
      audio.currentTime = 0;
      audio.muted = silent;
      await audio.play();
      if (disposed) return;
      removeInteractionListeners();
      if (silent) { reset(); next(); }
    } catch {
      // Autoplay denial, missing media and interrupted playback are non-fatal.
      if (!disposed) failed();
    }
  }
  function next() {
    if (disposed || busy || pending === 0) return;
    pending--;
    void start(false);
  }
  function unlock() {
    // Prime the same element silently during a normal mouse/touch/keyboard gesture.
    if (!disposed && !busy) void start(true);
  }
  const ended = () => { busy = false; next(); };
  audio.addEventListener("ended", ended);
  audio.addEventListener("error", failed);
  window.addEventListener("pointerup", unlock);
  window.addEventListener("keydown", unlock);

  return {
    play() {
      if (disposed) return;
      // Let each short chime finish, even when distinct events arrive together.
      pending++;
      next();
    },
    dispose() {
      disposed = true;
      pending = 0;
      removeInteractionListeners();
      audio.removeEventListener("ended", ended);
      audio.removeEventListener("error", failed);
      reset();
    },
  };
}
