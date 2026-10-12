import { ReactNode, useEffect, useState } from 'react';
import { cn } from './utils/cn';
import type { Hud, Summary } from './game/engine';

/* ------------------------------------------------------------------ Ikon */

type IconProps = { className?: string };

export const BoltIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M13.5 1.5 4 13.8h6.2L8.6 22.5 20 9.6h-6.6z" />
  </svg>
);

const PauseIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <rect x="6" y="4.5" width="4" height="15" rx="1.4" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.4" />
  </svg>
);

const PlayIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M7 4.6v14.8a1 1 0 0 0 1.5.9l12-7.4a1 1 0 0 0 0-1.8l-12-7.4A1 1 0 0 0 7 4.6z" />
  </svg>
);

const RestartIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.7-6.2" />
    <path d="M3.5 4v4.6h4.6" />
  </svg>
);

const HomeIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3.5 11 12 3.8 20.5 11" />
    <path d="M5.8 9.6V20h12.4V9.6" />
  </svg>
);

const SoundIcon = ({ className, off }: IconProps & { off?: boolean }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 9.5v5h3.6L12.5 19V5L7.6 9.5z" fill="currentColor" />
    {off ? (
      <path d="m16.5 9.5 5 5m0-5-5 5" />
    ) : (
      <>
        <path d="M16 9a4 4 0 0 1 0 6" />
        <path d="M18.6 6.4a8 8 0 0 1 0 11.2" />
      </>
    )}
  </svg>
);

const ChevronsDown = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m6 6 6 6 6-6" />
    <path d="m6 12 6 6 6-6" />
  </svg>
);

const ChevronsUp = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m6 18 6-6 6 6" />
    <path d="m6 12 6-6 6 6" />
  </svg>
);

const SparkIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M12 1.5Q12 12 22.5 12 12 12 12 22.5 12 12 1.5 12 12 12 12 1.5z" />
  </svg>
);

/* ------------------------------------------------------------------ Tombol kecil */

const glass =
  'bg-white/15 backdrop-blur-md border border-white/30 text-white shadow-[0_0.4em_1.4em_rgba(0,0,0,0.18)]';

export function RoundButton({
  onClick,
  label,
  children,
  className,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={cn(
        'pointer-events-auto grid size-[2.9em] place-items-center rounded-full transition active:scale-90',
        glass,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SoundButton({ muted, onToggle, className }: { muted: boolean; onToggle: () => void; className?: string }) {
  return (
    <RoundButton label={muted ? 'Nyalakan suara' : 'Matikan suara'} onClick={onToggle} className={className}>
      <SoundIcon off={muted} className="size-[1.3em]" />
    </RoundButton>
  );
}

/* ------------------------------------------------------------------ Menu utama */

export function MenuView({
  best,
  muted,
  onStart,
  onToggleMute,
}: {
  best: number;
  muted: boolean;
  onStart: () => void;
  onToggleMute: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center text-white"
      style={{
        background:
          'linear-gradient(to bottom, rgba(10,8,30,0.32), rgba(10,8,30,0) 36%, rgba(10,8,30,0) 66%, rgba(10,8,30,0.6))',
      }}
    >
      <div className="absolute right-[1.1em] top-[1.1em]">
        <SoundButton muted={muted} onToggle={onToggleMute} />
      </div>

      <div className="mt-[8.6em] flex animate-[fadeUp_1.1s_ease-out_both] flex-col items-center">
        <BoltIcon className="mb-[0.5em] size-[2.2em] text-[#ffd84a] drop-shadow-[0_0_0.6em_rgba(255,216,74,0.8)]" />
        <h1
          className="pl-[0.24em] text-[4.9em] font-light leading-none tracking-[0.24em]"
          style={{ textShadow: '0 0.05em 0.6em rgba(0,0,0,0.25)' }}
        >
          KILAT
        </h1>
        <div className="mt-[0.9em] flex items-center gap-[0.9em]">
          <span className="h-px w-[2.6em] bg-white/60" />
          <span className="pl-[0.6em] text-[1.1em] font-medium tracking-[0.6em]">ODYSSEY</span>
          <span className="h-px w-[2.6em] bg-white/60" />
        </div>
        <p className="mt-[1.5em] text-[0.82em] uppercase tracking-[0.28em] text-white/80">
          Berlari secepat cahaya
        </p>
      </div>

      <div className="mt-auto flex w-full animate-[fadeUp_1.3s_ease-out_0.25s_both] flex-col items-center gap-[1.25em] px-[1.6em] pb-[1.8em]">
        <button
          onClick={onStart}
          className="animate-[pulseGlow_2.4s_ease-in-out_infinite] rounded-full bg-gradient-to-b from-[#ffe58a] to-[#ffb62e] px-[3em] py-[0.95em] text-[1.15em] font-bold tracking-[0.32em] text-[#3a1d00] transition active:scale-95"
        >
          <span className="pl-[0.32em]">MULAI LARI</span>
        </button>

        <p className="text-[0.8em] tracking-[0.3em] text-white/75">
          REKOR&nbsp;&nbsp;<span className="font-semibold text-white">{best.toLocaleString('id-ID')} m</span>
        </p>

        <div className={cn('grid w-full grid-cols-3 gap-[0.6em] rounded-[1.2em] p-[0.9em] text-center', glass)}>
          <Legend icon={<ChevronsUp className="size-[1.5em]" />} title="KETUK" text="Lompat. Tahan = tinggi, ketuk lagi = lompat ganda" />
          <Legend icon={<ChevronsDown className="size-[1.5em]" />} title="TAHAN KIRI" text="Meluncur di bawah batu melayang" />
          <Legend icon={<BoltIcon className="size-[1.4em] text-[#ffd84a]" />} title="KILAT" text="Kumpulkan ✦ lalu aktifkan mode super cepat" />
        </div>
      </div>
    </div>
  );
}

function Legend({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-[0.35em] px-[0.2em]">
      <div className="text-white/95">{icon}</div>
      <div className="text-[0.72em] font-bold tracking-[0.18em]">{title}</div>
      <div className="text-[0.66em] leading-snug text-white/70">{text}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ HUD & kontrol */

export function HudView({
  hud,
  muted,
  onPause,
  onToggleMute,
}: {
  hud: Hud;
  muted: boolean;
  onPause: () => void;
  onToggleMute: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-[1.1em] text-white">
      <div style={{ textShadow: '0 0.08em 0.5em rgba(0,0,0,0.3)' }}>
        <div className="flex items-baseline gap-[0.3em] font-light leading-none">
          <span className="text-[3.1em] tabular-nums tracking-wide">{hud.dist.toLocaleString('id-ID')}</span>
          <span className="text-[1.1em] opacity-80">m</span>
        </div>
        <div className="mt-[0.5em] flex items-center gap-[0.5em] text-[0.82em] tracking-[0.2em] opacity-90">
          <BoltIcon className={cn('size-[1.1em]', hud.boosting ? 'text-[#fff3a0]' : 'text-[#ffd84a]')} />
          <span className="tabular-nums">{hud.speed} KM/J</span>
        </div>
      </div>

      <div className="flex items-center gap-[0.6em]">
        <div
          className="mr-[0.2em] flex items-center gap-[0.4em] text-[1.25em] font-medium tabular-nums"
          style={{ textShadow: '0 0.08em 0.5em rgba(0,0,0,0.3)' }}
        >
          <SparkIcon className="size-[1em] text-[#ffd84a]" />
          {hud.orbs}
        </div>
        <SoundButton muted={muted} onToggle={onToggleMute} className="size-[2.5em]" />
        <RoundButton label="Jeda" onClick={onPause} className="size-[2.5em]">
          <PauseIcon className="size-[1.1em]" />
        </RoundButton>
      </div>
    </div>
  );
}

export function FlashButton({
  hud,
  onPress,
  onRelease,
}: {
  hud: Hud;
  onPress: () => void;
  onRelease?: () => void;
}) {
  const R = 44;
  const C = 2 * Math.PI * R;
  const active = hud.ready;
  const canTouch = active || hud.boosting;
  const mult = hud.boostMult ?? 1;

  return (
    <div className="pointer-events-none absolute bottom-[1.5em] right-[1.3em] z-30 flex flex-col items-center gap-[0.35em]">
      <button
        aria-label="Aktifkan Kilat"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onPress();
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onRelease?.();
        }}
        onPointerCancel={() => onRelease?.()}
        onPointerLeave={() => onRelease?.()}
        style={{ pointerEvents: canTouch ? 'auto' : 'none' }}
        className={cn(
          'relative grid size-[5.4em] place-items-center rounded-full transition-transform active:scale-95',
          active && 'animate-[readyPulse_0.9s_ease-in-out_infinite]',
          hud.boosting && mult >= 4.5 && 'animate-[readyPulse_0.5s_ease-in-out_infinite]',
        )}
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r="46" fill={active ? 'rgba(255,200,60,0.92)' : hud.boosting ? 'rgba(255,214,64,0.35)' : 'rgba(10,8,30,0.34)'} />
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="5" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={hud.boosting ? (mult >= 4.5 ? '#ffffff' : '#fff6b0') : '#ffd23f'}
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - clamp01(hud.meter))}
            style={{ transition: 'stroke-dashoffset 0.12s linear' }}
          />
        </svg>
        <BoltIcon
          className={cn(
            'relative size-[2.4em]',
            active ? 'text-[#4a2600]' : hud.boosting ? (mult >= 4.5 ? 'text-white' : 'text-[#fff6b0]') : 'text-white/80',
          )}
        />
      </button>
      <span
        className={cn(
          'text-[0.72em] font-bold tracking-[0.25em] text-white transition-colors',
          active || hud.boosting ? 'opacity-100' : 'opacity-60',
          hud.boosting && mult >= 4.5 && 'text-[#ffe66d] drop-shadow-[0_0_0.4em_rgba(255,214,64,0.8)]',
        )}
        style={{ textShadow: '0 0.08em 0.4em rgba(0,0,0,0.4)' }}
      >
        {hud.boosting
          ? mult >= 4.8
            ? 'HYPER 5X!'
            : `${mult.toFixed(1)}X KILAT!`
          : active
            ? 'PANJER!'
            : 'KILAT'}
      </span>
    </div>
  );
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function SlideHint({ pressed }: { pressed: boolean }) {
  return (
    <div className="pointer-events-none absolute bottom-[1.5em] left-[1.3em] z-20 flex flex-col items-center gap-[0.35em]">
      <div
        className={cn(
          'grid size-[5.4em] place-items-center rounded-full border transition',
          pressed ? 'border-white/70 bg-white/35' : 'border-white/30 bg-[rgba(10,8,30,0.28)]',
        )}
      >
        <ChevronsDown className="size-[2.1em] text-white/90" />
      </div>
      <span
        className="text-[0.7em] font-bold tracking-[0.3em] text-white opacity-70"
        style={{ textShadow: '0 0.08em 0.4em rgba(0,0,0,0.4)' }}
      >
        LUNCUR
      </span>
    </div>
  );
}

export function TutorialHint({ show }: { show: boolean }) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 top-[34%] z-20 flex justify-center transition-opacity duration-700',
        show ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className={cn('flex animate-[floaty_2.4s_ease-in-out_infinite] items-center gap-[0.9em] rounded-full px-[1.5em] py-[0.8em] text-[0.82em] tracking-[0.12em]', glass)}>
        <span>Ketuk = lompat</span>
        <span className="h-[1.2em] w-px bg-white/40" />
        <span>Tahan kiri = luncur</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Jeda */

export function PauseView({
  muted,
  onResume,
  onRestart,
  onMenu,
  onToggleMute,
}: {
  muted: boolean;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
  onToggleMute: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex animate-[fadeIn_0.3s_ease-out_both] flex-col items-center justify-center gap-[1.4em] bg-[#0a0920]/55 text-white backdrop-blur-sm">
      <p className="pl-[0.5em] text-[2.2em] font-light tracking-[0.5em]">JEDA</p>
      <button
        onClick={onResume}
        className="flex items-center gap-[0.7em] rounded-full bg-gradient-to-b from-[#ffe58a] to-[#ffb62e] px-[2.6em] py-[0.9em] text-[1.05em] font-bold tracking-[0.28em] text-[#3a1d00] transition active:scale-95"
      >
        <PlayIcon className="size-[1.1em]" />
        LANJUT
      </button>
      <div className="flex gap-[0.9em]">
        <RoundButton label="Ulangi" onClick={onRestart} className="size-[3.4em]">
          <RestartIcon className="size-[1.5em]" />
        </RoundButton>
        <RoundButton label="Menu utama" onClick={onMenu} className="size-[3.4em]">
          <HomeIcon className="size-[1.5em]" />
        </RoundButton>
        <SoundButton muted={muted} onToggle={onToggleMute} className="size-[3.4em]" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Game over */

export function OverView({
  summary,
  onRestart,
  onMenu,
}: {
  summary: Summary;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 650);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="absolute inset-0 z-40 flex animate-[fadeIn_0.6s_ease-out_both] items-center justify-center bg-[#0a0920]/45 text-white backdrop-blur-[2px]">
      <div className={cn('w-[82%] animate-[fadeUp_0.8s_ease-out_both] rounded-[1.6em] px-[1.4em] py-[2em] text-center', glass)}>
        <p className="pl-[0.4em] text-[0.8em] tracking-[0.42em] text-white/70">LARIAN BERAKHIR</p>
        <p className="mt-[0.3em] flex items-baseline justify-center gap-[0.25em] font-light leading-none">
          <span className="text-[4.8em] tabular-nums">{summary.dist.toLocaleString('id-ID')}</span>
          <span className="text-[1.3em] opacity-80">m</span>
        </p>

        <div className="mt-[0.9em] flex h-[2em] items-center justify-center">
          {summary.isBest ? (
            <span className="flex items-center gap-[0.5em] rounded-full bg-[#ffd84a] px-[1.1em] py-[0.35em] text-[0.8em] font-bold tracking-[0.22em] text-[#3a1d00]">
              <BoltIcon className="size-[1em]" /> REKOR BARU
            </span>
          ) : null}
        </div>

        <div className="mt-[1em] grid grid-cols-3 gap-[0.4em] border-y border-white/20 py-[1em]">
          <Stat label="REKOR" value={summary.best.toLocaleString('id-ID')} />
          <Stat label="ORB" value={String(summary.orbs)} />
          <Stat label="HANCUR" value={String(summary.smashed)} />
        </div>

        <div className={cn('mt-[1.6em] flex flex-col items-center gap-[0.9em] transition-opacity', ready ? 'opacity-100' : 'pointer-events-none opacity-40')}>
          <button
            onClick={onRestart}
            className="flex items-center gap-[0.7em] rounded-full bg-gradient-to-b from-[#ffe58a] to-[#ffb62e] px-[2.4em] py-[0.9em] text-[1.05em] font-bold tracking-[0.26em] text-[#3a1d00] transition active:scale-95"
          >
            <RestartIcon className="size-[1.1em]" />
            LARI LAGI
          </button>
          <button onClick={onMenu} className="text-[0.75em] tracking-[0.3em] text-white/70 transition hover:text-white">
            MENU UTAMA
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[1.5em] font-light tabular-nums">{value}</div>
      <div className="mt-[0.15em] text-[0.62em] tracking-[0.25em] text-white/60">{label}</div>
    </div>
  );
}
