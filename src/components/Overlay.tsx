import type { ReactNode } from 'react'

export default function Overlay({ title, blink, children }: { title: string; blink?: boolean; children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/75 px-8 text-center">
      <h2 className={`font-arcade text-base leading-relaxed text-pac glow-maze ${blink ? 'animate-blink' : ''}`}>
        {title}
      </h2>
      <p className="max-w-xs text-sm leading-relaxed text-neutral-300">{children}</p>
    </div>
  )
}
