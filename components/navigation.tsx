"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useMedia } from "react-use";
import { Home, List, MessageCircle, Bot, Mic, X, ChevronDown } from "lucide-react";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";
import { UserButton } from "@clerk/nextjs";
import { MoreDropdown } from "./more-dropdown";
import { AddNewDropdown } from "./add-new-dropdown-phone-plus";
import ChatBot from "./chat-assistant";
import VoiceAssistant from "./voice-assistant";

export const Navigation = () => {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useMedia("(max-width: 1024px)", false);
  const newTransaction = useNewTransaction();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAssistantModalOpen, setIsAssistantModalOpen] = useState(false);
  const [assistantSelection, setAssistantSelection] = useState<'voice' | 'text'>('text');
  const [openType, setOpenType] = useState<'chat' | 'voice' | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const isActive = (href: string) => pathname === href;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const closeAssistant = () => {
    setIsClosing(true);
    setTimeout(() => {
      setOpenType(null);
      setIsClosing(false);
    }, 300);
  };

  const handleAssistantOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      closeAssistant();
    }
  };

  const handleAssistantLaunch = () => {
    if (assistantSelection === 'text') {
      setOpenType('chat');
    } else {
      setOpenType('voice');
    }
    setIsAssistantModalOpen(false);
  };

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

            {/* Assistant with Select Modal */}
            <div className="relative flex flex-col items-center justify-end gap-1">
              <button
                onClick={() => setIsAssistantModalOpen(true)}
                className="flex flex-col items-center text-gray-500 dark:text-gray-400"
              >
                <MessageCircle className="size-6" />
              </button>
              <span className="text-gray-500 dark:text-gray-400">Assistant</span>
            </div>
          </div>
        </nav>

        {/* Assistant Selection Modal */}
        {isAssistantModalOpen && (
          <div
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setIsAssistantModalOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm transform transition-all duration-300 ease-out animate-enter overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Choose Assistant</h2>
                <button
                  onClick={() => setIsAssistantModalOpen(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 space-y-4">
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  Select how you&apos;d like to interact with your assistant:
                </p>

                {/* Select Dropdown */}
                <div className="relative">
                  <select
                    value={assistantSelection}
                    onChange={(e) => setAssistantSelection(e.target.value as 'voice' | 'text')}
                    className="w-full appearance-none bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  >
                    <option value="text">💬 Text Chat</option>
                    <option value="voice">🎤 Voice Assistant</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500 dark:text-gray-400 pointer-events-none" />
                </div>

                {/* Preview */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                  {assistantSelection === 'text' ? (
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <Mic className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {assistantSelection === 'text' ? 'Text Assistant' : 'Voice Assistant'}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {assistantSelection === 'text' 
                        ? 'Chat via text messages' 
                        : 'Talk with voice commands'
                      }
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-3 p-4 border-t border-gray-200 dark:border-slate-700">
                <button
                  onClick={() => setIsAssistantModalOpen(false)}
                  className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssistantLaunch}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  {assistantSelection === 'text' ? <Bot className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  Launch
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Assistant Modal */}
        {(openType === 'chat' || openType === 'voice') && (
          <div
            onClick={handleAssistantOverlayClick}
            className={`fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 lg:p-8 
              ${isClosing
                ? 'animate-out fade-out slide-out-to-bottom duration-300'
                : 'animate-in fade-in slide-in-from-bottom duration-300'
              }`}
          >
            <div
              className={`rounded-2xl w-full max-w-6xl h-full max-h-[90vh] sm:max-h-[85vh] flex flex-col relative
                ${isClosing
                  ? 'animate-out zoom-out-95 fade-out duration-300'
                  : 'animate-in zoom-in-95 fade-in duration-300'
                }
                ${openType === 'voice'
                  ? 'bg-transparent backdrop-blur-none border-none shadow-none'
                  : 'bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border border-white/20 dark:border-zinc-700/50 shadow-2xl'
                }`}
            >
              {/* Close Button (inside the popup) */}
              <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10">
                <button
                  onClick={closeAssistant}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm rounded-full p-2 shadow-lg hover:shadow-xl transition-all duration-200 border border-gray-200/50 dark:border-zinc-600/50"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden rounded-2xl">
                {openType === 'chat' ? (
                  <div className="h-full">
                    <ChatBot />
                  </div>
                ) : (
                  <VoiceAssistant />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Animation Style */}
        <style jsx global>{`
          @keyframes enter {
            0% {
              opacity: 0;
              transform: scale(0.95) translateY(20px);
            }
            100% {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }

          .animate-enter {
            animation: enter 0.3s ease-out forwards;
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
