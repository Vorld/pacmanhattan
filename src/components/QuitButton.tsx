import { useState } from 'react'

/** Press and hold to end the run — a stray tap does nothing. */
export default function QuitButton({ onQuit }: { onQuit: () => void }) {
  const [holding, setHolding] = useState(false)

  return (
    <button
      type="button"
      aria-label="Hold to end the game"
      className="absolute right-3 bottom-6 flex touch-none select-none items-center gap-2 rounded-full border border-neutral-600 bg-black/80 py-2 pr-3 pl-2 font-arcade text-[9px] text-neutral-300"
      onPointerDown={() => setHolding(true)}
      onPointerUp={() => setHolding(false)}
      onPointerLeave={() => setHolding(false)}
      onPointerCancel={() => setHolding(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="relative grid h-6 w-6 place-items-center">
        <svg viewBox="0 0 24 24" className="absolute inset-0 -rotate-90">
          <circle cx="12" cy="12" r="10" fill="none" stroke="#333" strokeWidth="2.5" />
          {holding && (
            <circle
              className="hold-ring"
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke="var(--color-blinky)"
              strokeWidth="2.5"
              pathLength="1"
              onAnimationEnd={onQuit}
            />
          )}
        </svg>
        <span className="text-[10px]">✕</span>
      </span>
      {holding ? 'KEEP HOLDING' : 'HOLD TO END'}
    </button>
  )
}
