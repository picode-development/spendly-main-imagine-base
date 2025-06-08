'use client';

import React, { useState } from 'react';
import { Bot, Mic, MessageCircle, X, ChevronDown } from 'lucide-react';
import ChatBot from './chat-assistant';
import VoiceAssistant from './voice-assistant';

const Assistant = () => {
  const [openType, setOpenType] = useState<'chat' | 'voice' | null>(null);
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [assistantSelection, setAssistantSelection] = useState<'voice' | 'text'>('text');

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

  return (
    <>
      {/* Desktop Only Launcher Button - Hidden on phones and tablets */}
      <div className="fixed bottom-6 right-6 z-[100] hidden xl:block">
        <button
          onClick={() => setIsSelectionModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl transform active:scale-95"
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
            className="bg-slate-800 rounded-xl shadow-xl w-full max-w-sm transform transition-all duration-300 ease-out animate-enter overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Choose Assistant</h2>
              <button
                onClick={() => setIsSelectionModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-slate-700 transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              <p className="text-gray-300 text-sm">
                Select how you'd like to interact with your assistant:
              </p>

              {/* Select Dropdown */}
              <div className="relative">
                <select
                  value={assistantSelection}
                  onChange={(e) => setAssistantSelection(e.target.value as 'voice' | 'text')}
                  className="w-full appearance-none bg-slate-700 text-white border border-slate-600 rounded-lg px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                >
                  <option value="text">💬 Text Chat</option>
                  <option value="voice">🎤 Voice Assistant</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>

              {/* Preview */}
              <div className="flex items-center gap-3 p-3 bg-slate-700 rounded-lg">
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
                  <p className="font-medium text-white">
                    {assistantSelection === 'text' ? 'Text Assistant' : 'Voice Assistant'}
                  </p>
                  <p className="text-sm text-gray-400">
                    {assistantSelection === 'text' 
                      ? 'Chat via text messages' 
                      : 'Talk with voice commands'
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-4 border-t border-slate-700">
              <button
                onClick={() => setIsSelectionModalOpen(false)}
                className="flex-1 px-4 py-2 text-gray-300 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors font-medium"
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
          onClick={handleOverlayClick}
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
                onClick={closePopup}
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
};

export default Assistant;
