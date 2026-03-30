"use client"

import { useEffect, useState } from "react"
import { WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"

/** באנר קטן כשאין חיבור רשת (מצב offline בדפדפן). */
export function NetworkStatusBanner() {
  const [online, setOnline] = useState(() =>
    typeof window !== "undefined" ? navigator.onLine : true,
  )

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener("online", up)
    window.addEventListener("offline", down)
    return () => {
      window.removeEventListener("online", up)
      window.removeEventListener("offline", down)
    }
  }, [])

  if (online) return null

  return (
    <div
      role="status"
      className={cn(
        "fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium",
        "bg-amber-600 text-white shadow-md",
      )}
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>אין חיבור לאינטרנט — חלק מהפעולות לא יישמרו עד שיחזור החיבור</span>
    </div>
  )
}
