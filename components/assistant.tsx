'use client';

import React, { useState } from 'react';
import { Bot, Mic, MessageCircle, X, ChevronDown } from 'lucide-react';
import { useTheme } from "next-themes";
import ChatBot from './chat-assistant';
import VoiceAssistant from './voice-assistant';

const Assistant = () => {
  const { theme, resolvedTheme } = useTheme();
  const [openType, setOpenType] = useState<'chat' | 'voice' | null>(null);
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [assistantSelection, setAssistantSelection] = useState<'voice' | 'text'>('text');

  // Determine current theme state
  const getCurrentTheme = () => {
    if (theme === 'system') {
      return resolvedTheme || 'dark';
    }
    return theme;
  };

  const currentTheme = getCurrentTheme();

  // Theme-based styling functions
  const getLauncherButtonClasses = () => {
    switch (currentTheme) {
      case 'light':
        return "bg-blue-500 hover:bg-blue-600 text-white p-4 rounded-full shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl transform active:scale-95";
      case 'dark':
        return "bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl transform active:scale-95";
      case 'system':
      default:
        return "bg-slate-600 hover:bg-slate-700 text-white p-4 rounded-full shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl transform active:scale-95";
    }
  };

  const getModalBackgroundClasses = () => {
    switch (currentTheme) {
      case 'light':
        return "bg-white rounded-xl shadow-xl w-full max-w-sm transform transition-all duration-300 ease-out animate-enter overflow-hidden border border-gray-200";
      case 'dark':
        return "bg-slate-800 rounded-xl shadow-xl w-full max-w-sm transform transition-all duration-300 ease-out animate-enter overflow-hidden border border-slate-700";
      case 'system':
      default:
        return "bg-slate-100 rounded-xl shadow-xl w-full max-w-sm transform transition-all duration-300 ease-out animate-enter overflow-hidden border border-slate-300";
    }
  };

  const getModalHeaderClasses = () => {
    switch (currentTheme) {
      case 'light':
        return "flex items-center justify-between p-4 border-b border-gray-200";
      case 'dark':
        return "flex items-center justify-between p-4 border-b border-slate-700";
      case 'system':
      default:
        return "flex items-center justify-between p-4 border-b border-slate-300";
    }
  };

  const getModalTitleClasses = () => {
    switch (currentTheme) {
      case 'light':
        return "text-lg font-semibold text-gray-900";
      case 'dark':
        return "text-lg font-semibold text-white";
      case 'system':
      default:
        return "text-lg font-semibold text-slate-800";
    }
  };

  const getCloseButtonClasses = () => {
    switch (currentTheme) {
      case 'light':
        return "text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition-colors";
      case 'dark':
        return "text-gray-400 hover:text-white p-1 rounded-full hover:bg-slate-700 transition-colors";
      case 'system':
      default:
        return "text-slate-500 hover:text-slate-700 p-1 rounded-full hover:bg-slate-200 transition-colors";
    }
  };

  const getModalTextClasses = () => {
    switch (currentTheme) {
      case 'light':
        return "text-gray-600 text-sm";
      case 'dark':
        return "text-gray-300 text-sm";
      case 'system':
      default:
        return "text-slate-600 text-sm";
    }
  };

  const getSelectClasses = () => {
    switch (currentTheme) {
      case 'light':
        return "w-full appearance-none bg-white text-gray-900 border border-gray-300 rounded-lg px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200";
      case 'dark':
        return "w-full appearance-none bg-slate-700 text-white border border-slate-600 rounded-lg px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200";
      case 'system':
      default:
        return "w-full appearance-none bg-slate-50 text-slate-800 border border-slate-300 rounded-lg px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500 transition-all duration-200";
    }
  };

  const getPreviewClasses = () => {
    switch (currentTheme) {
      case 'light':
        return "flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200";
      case 'dark':
        return "flex items-center gap-3 p-3 bg-slate-700 rounded-lg";
      case 'system':
      default:
        return "flex items-center gap-3 p-3 bg-slate-200 rounded-lg";
    }
  };

  const getPreviewTextClasses = () => {
    switch (currentTheme) {
      case 'light':
        return {
          title: "font-medium text-gray-900",
          subtitle: "text-sm text-gray-600"
        };
      case 'dark':
        return {
          title: "font-medium text-white",
          subtitle: "text-sm text-gray-400"
        };
      case 'system':
      default:
        return {
          title: "font-medium text-slate-800",
          subtitle: "text-sm text-slate-600"
        };
    }
  };

  const getFooterClasses = () => {
    switch (currentTheme) {
      case 'light':
        return "flex gap-3 p-4 border-t border-gray-200";
      case 'dark':
        return "flex gap-3 p-4 border-t border-slate-700";
      case 'system':
      default:
        return "flex gap-3 p-4 border-t border-slate-300";
    }
  };

  const getCancelButtonClasses = () => {
    switch (currentTheme) {
      case 'light':
        return "flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium";
      case 'dark':
        return "flex-1 px-4 py-2 text-gray-300 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors font-medium";
      case 'system':
      default:
        return "flex-1 px-4 py-2 text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 transition-colors font-medium";
    }
  };

  const getLaunchButtonClasses = () => {
    switch (currentTheme) {
      case 'light':
        return "flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium flex items-center justify-center gap-2";
      case 'dark':
        return "flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2";
      case 'system':
      default:
        return "flex-1 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium flex items-center justify-center gap-2";
    }
  };

  const getMainModalClasses = () => {
    const baseClasses = `rounded-2xl w-full max-w-6xl h-full max-h-[90vh] sm:max-h-[85vh] flex flex-col relative
      ${isClosing
        ? 'animate-out zoom-out-95 fade-out duration-300'
        : 'animate-in zoom-in-95 fade-in duration-300'
      }`;

    if (openType === 'voice') {
      return `${baseClasses} bg-transparent backdrop-blur-none border-none shadow-none`;
    }

    switch (currentTheme) {
      case 'light':
        return `${baseClasses} bg-white/95 backdrop-blur-sm border border-gray-200/50 shadow-2xl`;
      case 'dark':
        return `${baseClasses} bg-zinc-900/95 backdrop-blur-sm border border-zinc-700/50 shadow-2xl`;
      case 'system':
      default:
        return `${baseClasses} bg-slate-50/95 backdrop-blur-sm border border-slate-300/50 shadow-2xl`;
    }
  };

  const getMainCloseButtonClasses = () => {
    switch (currentTheme) {
      case 'light':
        return "text-gray-500 hover:text-gray-700 bg-white/80 backdrop-blur-sm rounded-full p-2 shadow-lg hover:shadow-xl transition-all duration-200 border border-gray-200/50";
      case 'dark':
        return "text-gray-300 hover:text-white bg-zinc-800/80 backdrop-blur-sm rounded-full p-2 shadow-lg hover:shadow-xl transition-all duration-200 border border-zinc-600/50";
      case 'system':
      default:
        return "text-slate-500 hover:text-slate-700 bg-slate-100/80 backdrop-blur-sm rounded-full p-2 shadow-lg hover:shadow-xl transition-all duration-200 border border-slate-300/50";
    }
  };

  const closePopup = () => {
    setIsClosing(true);
    setTimeout(() => {
      setOpenType(null);
      setIsClosing(false);
    }, 300);
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      closePopup();
    }
  };

  const handleAssistantLaunch = () => {
    if (assistantSelection === 'text') {
      setOpenType('chat');
    } else {
      setOpenType('voice');
    }
    setIsSelectionModalOpen(false);
  };

  const previewTextClasses = getPreviewTextClasses();

  return (
    <>
      {/* Desktop Only Launcher Button - Hidden on phones and tablets */}
      <div className="fixed bottom-6 right-6 z-[100] hidden xl:block">
        <button
          onClick={() => setIsSelectionModalOpen(true)}
          className={getLauncherButtonClasses()}
        >
          <MessageCircle className="w-6 h-6 transition-transform duration-300" />
        </button>
      </div>

      {/* Assistant Selection Modal */}
      {isSelectionModalOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsSelectionModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={getModalBackgroundClasses()}
          >
            {/* Header */}
            <div className={getModalHeaderClasses()}>
              <h2 className={getModalTitleClasses()}>Choose Assistant</h2>
              <button
                onClick={() => setIsSelectionModalOpen(false)}
                className={getCloseButtonClasses()}
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              <p className={getModalTextClasses()}>
                Select how you&apos;d like to interact with your assistant:
              </p>

              {/* Select Dropdown */}
              <div className="relative">
                <select
                  value={assistantSelection}
                  onChange={(e) => setAssistantSelection(e.target.value as 'voice' | 'text')}
                  className={getSelectClasses()}
                >
                  <option value="text">💬 Text Chat</option>
                  <option value="voice">🎤 Voice Assistant</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>

              {/* Preview */}
              <div className={getPreviewClasses()}>
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
                  <p className={previewTextClasses.title}>
                    {assistantSelection === 'text' ? 'Text Assistant' : 'Voice Assistant'}
                  </p>
                  <p className={previewTextClasses.subtitle}>
                    {assistantSelection === 'text' 
                      ? 'Chat via text messages' 
                      : 'Talk with voice commands'
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={getFooterClasses()}>
              <button
                onClick={() => setIsSelectionModalOpen(false)}
                className={getCancelButtonClasses()}
              >
                Cancel
              </button>
              <button
                onClick={handleAssistantLaunch}
                className={getLaunchButtonClasses()}
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
          onClick={handleOverlayClick}
          className={`fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 lg:p-8 
            ${isClosing
              ? 'animate-out fade-out slide-out-to-bottom duration-300'
              : 'animate-in fade-in slide-in-from-bottom duration-300'
            }`}
        >
          <div className={getMainModalClasses()}>
            {/* Close Button (inside the popup) */}
            <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10">
              <button
                onClick={closePopup}
                className={getMainCloseButtonClasses()}
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
};

export default Assistant;
