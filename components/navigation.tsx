"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useMedia } from "react-use";
import { Home, List, MessageCircle } from "lucide-react";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";
import { UserButton } from "@clerk/nextjs";
import { MoreDropdown } from "./more-dropdown";
import { AddNewDropdown } from "./add-new-dropdown-phone-plus";

export const Navigation = () => {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useMedia("(max-width: 1024px)", false);
  const newTransaction = useNewTransaction();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isActive = (href: string) => pathname === href;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (isMobile) {
    return (
      <>
        {/* Mobile Top Header */}
        <div
          className={`fixed top-0 inset-x-0 z-50 px-6 py-4 flex items-center justify-between transition-colors duration-300 backdrop-blur-md ${
            isScrolled
              ? "bg-blue-600/90 shadow-md dark:bg-[rgba(10,25,50,0.85)] dark:backdrop-blur-md dark:shadow-lg"
              : "bg-transparent"
          } dark:text-white`}
        >
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/White-Larger-Logo.svg"
              alt="Spendly Logo"
              height={28}
              width={28}
              className="object-contain"
            />
            <p className="text-white text-lg font-semibold">Spendly</p>
          </Link>
          <UserButton afterSignOutUrl="/" />
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="fixed bottom-0 inset-x-0 z-50 bg-white dark:bg-[#121826] px-4 py-2 border-t border-gray-200 dark:border-gray-700 transition-colors duration-300">
          <div className="relative grid grid-cols-5 items-end text-xs">
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => router.push("/")}
                className={`flex flex-col items-center ${
                  pathname === "/" ? "text-black font-semibold dark:text-white" : "text-gray-500 dark:text-gray-400"
                }`}
              >
                <Home className="size-6" />
                <span>Home</span>
              </button>
            </div>

            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => router.push("/transactions")}
                className={`flex flex-col items-center ${
                  pathname === "/transactions" ? "text-black font-semibold dark:text-white" : "text-gray-500 dark:text-gray-400"
                }`}
              >
                <List className="size-6" />
                <span>Transactions</span>
              </button>
            </div>

            <div className="relative flex justify-center items-end">
              <div className="absolute -top-18">
                <AddNewDropdown />
              </div>
            </div>

            <div className="flex flex-col items-center gap-1">
              <MoreDropdown />
            </div>

            {/* Assistant with Animated Modal */}
            <div className="relative flex flex-col items-center justify-end gap-1">
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex flex-col items-center text-gray-500 dark:text-gray-400"
              >
                <MessageCircle className="size-6" />
              </button>
              <span className="text-gray-500 dark:text-gray-400">Assistant</span>
            </div>
          </div>
        </nav>

        {/* Modal with Animation */}
        {isModalOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
            onClick={() => setIsModalOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-lg w-[85%] max-w-sm text-center transform transition-all duration-300 ease-out scale-95 opacity-0 animate-enter"
            >
              <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Coming Soon</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Chat feature is under development.
              </p>
              <button
                onClick={() => setIsModalOpen(false)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Animation Style */}
        <style jsx global>{`
          @keyframes enter {
            0% {
              opacity: 0;
              transform: scale(0.95);
            }
            100% {
              opacity: 1;
              transform: scale(1);
            }
          }

          .animate-enter {
            animation: enter 0.2s ease-out forwards;
          }
        `}</style>
      </>
    );
  }

  // Desktop nav (unchanged)
  return (
    <nav className="hidden lg:flex items-center gap-x-2 px-4">
      {[
        { href: "/", label: "Home" },
        { href: "/transactions", label: "Transactions" },
        { href: "/accounts", label: "Accounts" },
        { href: "/categories", label: "Categories" },
        { href: "/settings", label: "Settings" },
      ].map((route) => {
        const active = isActive(route.href);
        return (
          <button
            key={route.href}
            onClick={() => router.push(route.href)}
            className={`relative text-sm px-4 py-2 rounded-md font-medium transition-colors duration-200
          ${
            active
              ? "text-white bg-white/10 shadow-[0_0_4px_rgba(255,255,255,0.2)]"
              : "text-white/80 hover:text-white hover:bg-white/5 hover:shadow-[0_0_3px_rgba(255,255,255,0.1)]"
          }
          dark:${
            active
              ? "text-white bg-[rgba(20,40,80,0.6)] shadow-[0_0_6px_rgba(0,112,244,0.6)]"
              : "text-white/70 hover:text-white hover:bg-[rgba(20,40,80,0.4)] hover:shadow-[0_0_5px_rgba(0,112,244,0.4)]"
          }
        `}
          >
            {route.label}
            {active && (
              <span className="absolute left-1/2 -bottom-0.5 w-2/3 h-0.5 bg-white/50 rounded-full -translate-x-1/2 transition-all duration-300" />
            )}
          </button>
        );
      })}
    </nav>
  );
};
