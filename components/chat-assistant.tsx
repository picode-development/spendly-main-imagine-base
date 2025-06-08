"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, MessageSquare } from 'lucide-react';
import { useTheme } from "next-themes";
import { UserButton } from "@clerk/nextjs";

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

// Helper to render *-lines as bullet points and **bold** text
function renderMessageText(text: any) {
  // Ensure text is a string
  if (typeof text !== 'string') {
    if (text && typeof text.output === 'string') {
      text = text.output;
    } else {
      text = JSON.stringify(text ?? '');
    }
  }
  const lines = text.split('\n');
  const bulletLines = lines.filter((line: string) => line.trim().startsWith('*'));
  const nonEmptyLines = lines.filter((line: string) => line.trim().length > 0);

  // Helper to render bold markdown (**text**)
  const renderWithBold = (line: string, key?: React.Key) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <span key={key}>
        {parts.map((part: string, idx: number) =>
          /^\*\*[^*]+\*\*$/.test(part)
            ? <strong key={idx}>{part.slice(2, -2)}</strong>
            : part
        )}
      </span>
    );
  };

  if (bulletLines.length > 0 && bulletLines.length === nonEmptyLines.length) {
    return (
      <ul className="list-disc pl-5">
        {bulletLines.map((line: string, i: number) => (
          <li key={i}>{renderWithBold(line.replace(/^\*\s?/, ''), i)}</li>
        ))}
      </ul>
    );
  } else {
    return (
      <>
        {lines.map((line: string, i: number) =>
          line.trim().startsWith('*') ? (
            <div key={i} className="flex items-start">
              <span className="mr-2 text-lg font-bold">•</span>
              <span>{renderWithBold(line.replace(/^\*\s?/, ''), i)}</span>
            </div>
          ) : (
            <div key={i}>{renderWithBold(line, i)}</div>
          )
        )}
      </>
    );
  }
}

const ChatBot: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const { theme } = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDarkMode = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const WEBHOOK_URL = "https://imaginebeyond.app.n8n.cloud/webhook/a901f957-a0ca-494b-9ada-c5583c275190";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isTyping) return;

    const userMessage: Message = {
      id: Date.now(),
      text: inputMessage.trim(),
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const messageToSend = inputMessage.trim();
    setInputMessage('');
    setIsTyping(true);

    try {
      const response = await fetch(`${WEBHOOK_URL}?message=${encodeURIComponent(messageToSend)}`);
      if (!response.ok) throw new Error('Failed to get response');
      const responseText = await response.text();
      let botResponseText: any = responseText;

      try {
        const jsonResponse = JSON.parse(responseText);
        if (Array.isArray(jsonResponse) && jsonResponse[0]?.output) {
          botResponseText = jsonResponse[0].output;
        } else if (jsonResponse.output) {
          botResponseText = jsonResponse.output;
        } else {
          botResponseText = JSON.stringify(jsonResponse);
        }
      } catch {
        // Response is not JSON, using raw text
      }

      // Always ensure text is string
      const botMessage: Message = {
        id: Date.now() + 1,
        text: typeof botResponseText === 'string' ? botResponseText : JSON.stringify(botResponseText),
        sender: 'bot',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: Date.now() + 1,
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  };

  // Use onKeyDown instead of onKeyPress
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  };

  const themeStyles = {
    bg: isDarkMode ? 'bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900' : 'bg-gradient-to-br from-gray-50 to-blue-50',
    cardBg: isDarkMode ? 'bg-gray-800/80 backdrop-blur-sm border-gray-700/50' : 'bg-white/80 backdrop-blur-sm border-gray-200/50',
    text: isDarkMode ? 'text-white' : 'text-gray-900',
    textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
    inputBg: isDarkMode ? 'bg-gray-800/90 border-gray-600 text-white placeholder-gray-400' : 'bg-white/90 border-gray-300 text-gray-900 placeholder-gray-500',
    messageBg: isDarkMode ? 'bg-gray-800/90 border-gray-700' : 'bg-white/90 border-gray-200'
  };

  return (
    <div className={`flex flex-col h-full rounded-2xl overflow-hidden shadow-2xl animate-fadeIn ${themeStyles.bg}`}>
      {/* Header */}
      <div className={`${themeStyles.cardBg} border-b px-4 py-3`}>
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className={`text-lg font-bold ${themeStyles.text}`}>Somya</h1>
            <p className={`text-sm ${themeStyles.textSecondary}`}>Your intelligent financial companion</p>
          </div>
        </div>
      </div>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="text-center mt-16">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Bot className="w-10 h-10 text-white" />
            </div>
            <h3 className={`text-xl font-semibold mb-2 ${themeStyles.text}`}>Hi, I'm Somya</h3>
            <p className={`${themeStyles.textSecondary} max-w-md mx-auto text-base px-4`}>
              I'm here to help you with your financial queries and Spendly's data. Start by typing a message below!
            </p>
          </div>
        ) : (
          messages.map((message: Message) => (
            <div
              key={message.id}
              className={`flex mb-4 transition-all duration-500 ${
                message.sender === 'user' ? 'justify-end animate-slideInRight' : 'justify-start animate-slideInLeft'
              }`}
            >
              <div className={`flex items-end max-w-[85%] space-x-2 ${
                message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
              }`}>
                {/* Avatar */}
                {message.sender === 'user' ? (
                  <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 pointer-events-none">
                    <UserButton
                      afterSignOutUrl="/"
                      appearance={{
                        elements: {
                          userButtonAvatarBox: "w-10 h-10 rounded-full",
                          userButtonBox: "w-10 h-10",
                        },
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                )}
                {/* Message Bubble */}
                <div className={`px-4 py-3 rounded-2xl shadow-sm ${
                  message.sender === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-md'
                    : `${themeStyles.messageBg} ${themeStyles.text} border rounded-bl-md`
                }`}>
                  <div className="text-sm whitespace-pre-wrap">
                    {renderMessageText(message.text)}
                  </div>
                  <p className={`text-xs mt-1 opacity-70 ${
                    message.sender === 'user' ? 'text-indigo-100' : themeStyles.textSecondary
                  }`}>
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
        {isTyping && (
          <div className="flex items-center space-x-2 mb-4 animate-pulse">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className={`${themeStyles.messageBg} px-4 py-3 rounded-2xl`}>
              <div className="flex space-x-1">
                {[0, 1, 2].map((_, i: number) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {/* Input */}
      <div className={`${themeStyles.cardBg} border-t px-4 py-3`}>
        <div className="flex space-x-2 items-end">
          <input
            ref={inputRef}
            type="text"
            value={inputMessage}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me about your finances..."
            disabled={isTyping}
            className={`flex-1 border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${themeStyles.inputBg}`}
          />
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isTyping}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 text-white p-3 rounded-2xl transition-all duration-200 shadow-lg"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className={`text-xs mt-2 ${themeStyles.textSecondary}`}>
          *The answers given by Somya can be inaccurate sometimes, so for complex calculations prefer referring to the app's UI.
        </p>
      </div>
    </div>
  );
};

export default ChatBot;
