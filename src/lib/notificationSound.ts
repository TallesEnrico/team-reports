type AudioContextConstructor = typeof AudioContext;

function audioContextClass(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const legacy = (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
}

/** O navegador consegue tocar o som de aviso (Web Audio). */
export const canPlayNotificationSound = audioContextClass() !== null;

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (context) return context;
  const Context = audioContextClass();
  if (!Context) return null;
  try {
    context = new Context();
  } catch {
    return null;
  }
  return context;
}

/** O navegador só libera o áudio depois de um gesto na página: o primeiro clique ou tecla já deixa o som pronto. */
function unlockOnGesture() {
  if (!canPlayNotificationSound) return;
  const unlock = () => {
    const audio = getContext();
    if (audio && audio.state === 'suspended') void audio.resume().catch(() => undefined);
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

unlockOnGesture();

function tone(audio: AudioContext, frequency: number, start: number, duration: number) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

async function play() {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === 'suspended') {
    try {
      await audio.resume();
    } catch {
      return;
    }
  }
  if (audio.state !== 'running') return;
  const now = audio.currentTime;
  tone(audio, 880, now, 0.18);
  tone(audio, 1318.5, now + 0.12, 0.32);
}

/**
 * Toca o som de mensagem. As abas deste navegador recebem o mesmo envio:
 * só a primeira que pegar a trava toca, para o som não sair repetido.
 */
export function playNotificationSound({ shared = true }: { shared?: boolean } = {}) {
  if (!canPlayNotificationSound) return;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!shared || !locks) {
    void play();
    return;
  }
  void locks
    .request('team-report:notification-sound', { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      await play();
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    })
    .catch(() => undefined);
}
