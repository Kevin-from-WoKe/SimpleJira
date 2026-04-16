"use client"

import { useState, useRef, useCallback } from "react"
import { createPortal } from "react-dom"

type Pos = { x: number; y: number; above: boolean }

export function Tooltip({ text, children }: { text: string; children: React.ReactElement }) {
  const [pos, setPos] = useState<Pos | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    timer.current = setTimeout(() => {
      const estW = Math.min(text.length * 6.5 + 16, 300)
      const above = r.top > 36
      const rawX = r.left + r.width / 2
      const clampedX = Math.min(Math.max(rawX, estW / 2 + 8), window.innerWidth - estW / 2 - 8)
      setPos({ x: clampedX, y: above ? r.top - 6 : r.bottom + 6, above })
    }, 120)
  }, [text])

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setPos(null)
  }, [])

  return (
    <>
      {typeof window !== "undefined" && pos && createPortal(
        <div
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y,
            transform: pos.above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
            zIndex: 9999,
            pointerEvents: "none",
          }}
          className="px-2 py-1 rounded-md border border-border bg-popover text-popover-foreground text-[11px] whitespace-nowrap shadow-md"
        >
          {text}
        </div>,
        document.body
      )}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(() => {
        const child = children as any
        return { ...child, props: { ...child.props, onMouseEnter: show, onMouseLeave: hide } }
      })()}
    </>
  )
}
