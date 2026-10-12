import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { Game } from './game/engine';
import type { GameState, Hud, Summary } from './game/engine';
import { cn } from './utils/cn';
import { FlashButton, HudView, MenuView, OverView, PauseView, SlideHint, TutorialHint } from './ui';

const EMPTY_HUD: Hud = { dist: 0, speed: 0, orbs: 0, meter: 0, boosting: false, ready: false };

function calcFrame() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(200, Math.floor(Math.min(vw, (vh * 9) / 16)));
  return { w, h: Math.floor((w * 16) / 9), framed: w < vw - 8 };
}

function readBest(): number {
  try {
    return Number(localStorage.getItem('kilat-best') || 0) || 0;
  } catch {
    return 0;
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem('kilat-muted') === '1';
  } catch {
    return false;
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [frame, setFrame] = useState(calcFrame);
  const [state, setState] = useState<GameState>('menu');
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [best, setBest] = useState(readBest);
  const [muted, setMuted] = useState(readMuted);
  const [showHint, setShowHint] = useState(false);
  const [slidePressed, setSlidePressed] = useState(false);

  const stateRef = useRef<GameState>('menu');
  const prevState = useRef<GameState>('menu');
  const frameRef = useRef(frame);
  const jumpPtrs = useRef(new Set<number>());
  const slidePtrs = useRef(new Set<number>());
  const overAt = useRef(0);
  const hintTimer = useRef(0);

  // ---- Buat engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = new Game(canvas, {
      onHud: (h) =>
        setHud((o) =>
          o.dist === h.dist &&
          o.speed === h.speed &&
          o.orbs === h.orbs &&
          o.boosting === h.boosting &&
          o.ready === h.ready &&
          Math.abs(o.meter - h.meter) < 0.004
            ? o
            : h,
        ),
      onState: (s, sum) => {
        setState(s);
        if (s === 'over' && sum) {
          setSummary(sum);
          setBest(sum.best);
          overAt.current = performance.now();
        }
      },
    });
    g.resize(frameRef.current.w, Math.min(2, window.devicePixelRatio || 1));
    g.setMuted(readMuted());
    gameRef.current = g;
    return () => {
      g.destroy();
      gameRef.current = null;
    };
  }, []);

  // ---- Ukuran bingkai 9:16
  useEffect(() => {
    const onResize = () => setFrame(calcFrame());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  useEffect(() => {
    frameRef.current = frame;
    gameRef.current?.resize(frame.w, Math.min(2, window.devicePixelRatio || 1));
  }, [frame]);

  // ---- Perubahan status
  useEffect(() => {
    const prev = prevState.current;
    prevState.current = state;
    stateRef.current = state;
    if (state === 'playing' && prev !== 'paused') {
      setShowHint(true);
      window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setShowHint(false), 4800);
    }
    if (state !== 'playing') {
      gameRef.current?.jumpUp();
      gameRef.current?.slideUp();
      jumpPtrs.current.clear();
      slidePtrs.current.clear();
      setSlidePressed(false);
    }
    if (state === 'menu' || state === 'over') setShowHint(false);
  }, [state]);

  // ---- Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g) return;
      const s = stateRef.current;
      switch (e.code) {
        case 'Space':
        case 'ArrowUp':
        case 'KeyW':
        case 'Enter':
          e.preventDefault();
          if (e.repeat) break;
          if (s === 'menu') g.start();
          else if (s === 'over') {
            if (performance.now() - overAt.current > 700) g.start();
          } else if (s === 'paused') g.resume();
          else if (s === 'playing' && e.code !== 'Enter') g.jumpDown();
          break;
        case 'ArrowDown':
        case 'KeyS':
          e.preventDefault();
          if (s === 'playing') g.slideDown();
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
        case 'KeyE':
        case 'KeyB':
        case 'ArrowRight':
          if (s === 'playing') g.boostDown();
          break;
        case 'Escape':
        case 'KeyP':
          if (s === 'playing') g.pause();
          else if (s === 'paused') g.resume();
          break;
        default:
          break;
      }
    };
    const up = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g) return;
      switch (e.code) {
        case 'Space':
        case 'ArrowUp':
        case 'KeyW':
          g.jumpUp();
          break;
        case 'ArrowDown':
        case 'KeyS':
          g.slideUp();
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
        case 'KeyE':
        case 'KeyB':
        case 'ArrowRight':
          g.boostUp();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ---- Aksi
  const start = () => gameRef.current?.start();
  const toMenu = () => gameRef.current?.toMenu();
  const toggleMute = () => {
    const n = !muted;
    setMuted(n);
    gameRef.current?.setMuted(n);
    try {
      localStorage.setItem('kilat-muted', n ? '1' : '0');
    } catch {
      /* abaikan */
    }
  };

  const onJumpDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    jumpPtrs.current.add(e.pointerId);
    gameRef.current?.jumpDown();
  };
  const onJumpUp = (e: RPointerEvent<HTMLDivElement>) => {
    jumpPtrs.current.delete(e.pointerId);
    if (jumpPtrs.current.size === 0) gameRef.current?.jumpUp();
  };
  const onSlideDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    slidePtrs.current.add(e.pointerId);
    setSlidePressed(true);
    gameRef.current?.slideDown();
  };
  const onSlideUp = (e: RPointerEvent<HTMLDivElement>) => {
    slidePtrs.current.delete(e.pointerId);
    if (slidePtrs.current.size === 0) {
      setSlidePressed(false);
      gameRef.current?.slideUp();
    }
  };

  const inRun = state === 'playing' || state === 'paused' || state === 'dying';

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,#1b1646_0%,#07061a_75%)]"
      style={{ touchAction: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className={cn(
          'relative select-none overflow-hidden bg-[#0a0920]',
          frame.framed && 'rounded-[1.8em] shadow-[0_0_6em_rgba(120,90,255,0.28)] ring-1 ring-white/15',
        )}
        style={{ width: frame.w, height: frame.h, fontSize: frame.w / 27 }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />

        {/* Zona sentuh: ketuk = lompat, tahan kiri bawah = meluncur */}
        {state === 'playing' && (
          <>
            <div
              className="absolute inset-0 z-10"
              onPointerDown={onJumpDown}
              onPointerUp={onJumpUp}
              onPointerCancel={onJumpUp}
            />
            <div
              className="absolute bottom-0 left-0 z-20 h-[46%] w-[40%]"
              onPointerDown={onSlideDown}
              onPointerUp={onSlideUp}
              onPointerCancel={onSlideUp}
            />
          </>
        )}

        {inRun && (
          <>
            <HudView
              hud={hud}
              muted={muted}
              onPause={() => gameRef.current?.pause()}
              onToggleMute={toggleMute}
            />
            <SlideHint pressed={slidePressed} />
            <FlashButton
              hud={hud}
              onPress={() => gameRef.current?.boostDown()}
              onRelease={() => gameRef.current?.boostUp()}
            />
            <TutorialHint show={showHint && state === 'playing'} />
          </>
        )}

        {state === 'menu' && (
          <MenuView best={best} muted={muted} onStart={start} onToggleMute={toggleMute} />
        )}

        {state === 'paused' && (
          <PauseView
            muted={muted}
            onResume={() => gameRef.current?.resume()}
            onRestart={start}
            onMenu={toMenu}
            onToggleMute={toggleMute}
          />
        )}

        {state === 'over' && summary && <OverView summary={summary} onRestart={start} onMenu={toMenu} />}
      </div>
    </div>
  );
}
