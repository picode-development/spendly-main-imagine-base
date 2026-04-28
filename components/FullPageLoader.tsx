"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

export const FullPageLoader = () => {
  const pathname = usePathname()
  const [isVisible, setIsVisible] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setFadeOut(true)

      // Wait for fade to complete before unmounting loader
      setTimeout(() => {
        setIsVisible(false)
      }, 1000)
    }, 800) // Delay before fade-out begins

    return () => clearTimeout(timeout)
  }, [pathname])

  if (!isVisible) return null

  return (
    <div
  className={`
    fixed inset-0 z-[9999] 
    bg-gradient-to-b from-blue-700 to-blue-500 
    dark:bg-[linear-gradient(to_bottom,var(--header-gradient-from),var(--header-gradient-to))]
    transition-opacity duration-300
  `}
>
      <div
        className={`
          flex flex-col items-center justify-center h-full text-white
          transition-opacity duration-1000 ease-in-out
          ${fadeOut ? "opacity-0" : "opacity-100"}
        `}
      >
        <Image
          src="/White-Larger-Logo.svg"
          alt="Spendly Logo"
          width={64}
          height={64}
          className="mb-2"
        />
        <h1 className="text-2xl font-semibold">Spendly</h1>

        <div className="mt-6 relative w-10 h-10">
          <svg
            className="absolute inset-0 w-full h-full animate-spin text-white/80"
            viewBox="0 0 50 50"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="25"
              cy="25"
              r="20"
              stroke="currentColor"
              strokeWidth="5"
              className="opacity-30"
            />
            <path
              fill="currentColor"
              d="M25 5a20 20 0 0 1 0 40V40a15 15 0 0 0 0-30V5z"
            />
          </svg>
        </div>

        <p className="mt-3 text-sm text-white/90">Your finances are loading...</p>
      </div>
    </div>
  )
}
