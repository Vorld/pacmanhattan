type Props = {
  caught: boolean
  survivedMs: number
  walkedMeters: number
  onPlayAgain: () => void
}

function duration(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

function distance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

export default function GameOver({ caught, survivedMs, walkedMeters, onPlayAgain }: Props) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-10 bg-black/90 px-6 text-center">
      <div className="flex flex-col gap-4">
        <h2 className="font-arcade text-2xl leading-relaxed text-blinky glow-maze">GAME OVER</h2>
        <p className="font-arcade text-[10px] text-neutral-400">
          {caught ? 'PAC-MAN GOT YOU' : 'YOU CALLED IT'}
        </p>
      </div>

      <dl className="grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-5 font-arcade text-[11px]">
        <dt className="text-left text-inky">SURVIVED</dt>
        <dd className="text-right text-white">{duration(survivedMs)}</dd>
        <dt className="text-left text-inky">WALKED</dt>
        <dd className="text-right text-white">{distance(walkedMeters)}</dd>
      </dl>

      <button
        type="button"
        onClick={onPlayAgain}
        className="rounded-lg border-2 border-pac px-6 py-4 font-arcade text-sm text-pac active:bg-pac active:text-black"
      >
        PLAY AGAIN
      </button>
    </div>
  )
}
