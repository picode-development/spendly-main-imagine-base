import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTheme } from "next-themes";

const VoiceAssistant = () => {
  const { theme, resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<number | null>(null);
  const widgetInstanceRef = useRef<HTMLElement | null>(null);
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  
  const embedCodes = useMemo(() => [
    "agent_01jxa7bvkyfv0r9g3ekahxq0hc", 
    "agent_01jxa8gh70fzyr92t8x3fk9hqj",
    "agent_01jxa9fg34f7eaz98pssa8mev0",
    "agent_01jxagsyzxf6zrhgr6ckqgbzew",
    "agent_01jxahvyx1f3b84d2x67kb0ncq",
    "agent_01jxamd39qetc97q2bkjawfncd",
    "agent_01jxan7m4bftwaz9dxqm20tvyf",
    "agent_01jxap98fee5y90yyxqdp56370",
    "agent_01jxaqdcxwfwmrdn2815g4qxdh",
    "agent_01jxarmr1se7zt1wwp2ntzygvh",
  ], []);

  // State to track current embed code - initialize with first embed code
  const [currentEmbedCode, setCurrentEmbedCode] = useState(embedCodes[0]);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [failedAgents, setFailedAgents] = useState<Set<string>>(new Set());
  const [lastShuffleTime, setLastShuffleTime] = useState(Date.now());
  const [showMessage, setShowMessage] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);

  // Determine current theme state
  const getCurrentTheme = () => {
    if (theme === 'system') {
      return resolvedTheme || 'dark';
    }
    return theme;
  };

  const currentTheme = getCurrentTheme();

  // Function to get a random embed code (excluding failed ones)
  const getRandomEmbedCode = useCallback(() => {
    const workingEmbeds = embedCodes.filter(code => !failedAgents.has(code));
    if (workingEmbeds.length === 0) {
      console.warn('All agents have failed, resetting failed list');
      setFailedAgents(new Set());
      return embedCodes[Math.floor(Math.random() * embedCodes.length)];
    }
    const randomIndex = Math.floor(Math.random() * workingEmbeds.length);
    return workingEmbeds[randomIndex];
  }, [embedCodes, failedAgents]);

  // Function to completely destroy the current widget
  const destroyCurrentWidget = useCallback(() => {
    console.log('Destroying current widget...');
    
    // Clear mutation observer
    if (mutationObserverRef.current) {
      mutationObserverRef.current.disconnect();
      mutationObserverRef.current = null;
    }
    
    // Remove widget from DOM
    if (widgetInstanceRef.current && widgetContainerRef.current) {
      try {
        // Try to properly unmount/cleanup the widget if it has cleanup methods
        if (typeof (widgetInstanceRef.current as any).destroy === 'function') {
          (widgetInstanceRef.current as any).destroy();
        }
        if (typeof (widgetInstanceRef.current as any).disconnect === 'function') {
          (widgetInstanceRef.current as any).disconnect();
        }
        
        // Remove from DOM
        widgetContainerRef.current.removeChild(widgetInstanceRef.current);
        console.log('Widget successfully removed from DOM');
      } catch (error) {
        console.warn('Error removing widget from DOM:', error);
        // Force clear the container if removal fails
        if (widgetContainerRef.current) {
          widgetContainerRef.current.innerHTML = '';
        }
      }
      
      widgetInstanceRef.current = null;
    }
    
    // Clear any lingering widget elements that might have escaped
    const escapedWidgets = document.querySelectorAll('elevenlabs-convai');
    escapedWidgets.forEach(widget => {
      if (widget.parentNode) {
        widget.parentNode.removeChild(widget);
        console.log('Removed escaped widget element');
      }
    });
    
    // Clear any absolute/fixed positioned elements that might be related
    const suspiciousElements = document.querySelectorAll('body > div[style*="position: absolute"], body > div[style*="position: fixed"]');
    suspiciousElements.forEach(element => {
      // Check if it might be related to ElevenLabs widget
      if (element.innerHTML.includes('elevenlabs') || element.className.includes('elevenlabs')) {
        element.remove();
        console.log('Removed suspicious escaped element');
      }
    });
  }, []);

  // Function to create a fresh widget
  const createFreshWidget = useCallback((agentId: string) => {
    if (!widgetContainerRef.current || !isScriptLoaded) {
      console.log('Cannot create widget: container not ready or script not loaded');
      return;
    }

    console.log(`Creating fresh widget with agent: ${agentId}`);
    
    // Create new DOM element
    const widgetElement = document.createElement('elevenlabs-convai');
    widgetElement.setAttribute('agent-id', agentId);
    
    // Add a unique key to force fresh initialization
    widgetElement.setAttribute('data-widget-key', `widget-${Date.now()}-${Math.random()}`);
    
    widgetContainerRef.current.appendChild(widgetElement);
    widgetInstanceRef.current = widgetElement;
    
    // Apply containment after initialization
    setTimeout(() => {
      forceWidgetContainment();
      
      // Set up new mutation observer
      if (mutationObserverRef.current) {
        mutationObserverRef.current.disconnect();
      }
      
      mutationObserverRef.current = new MutationObserver(() => {
        forceWidgetContainment();
      });
      
      mutationObserverRef.current.observe(widgetElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
      
      console.log(`Fresh widget created and configured for agent: ${agentId}`);
    }, 1000);
  }, [isScriptLoaded]);

  // Function to shuffle to a new embed code with complete widget replacement
  const shuffleEmbed = useCallback(async () => {
    const workingEmbeds = embedCodes.filter(code => !failedAgents.has(code));
    if (workingEmbeds.length <= 1) {
      console.log('Not enough working agents to shuffle');
      return;
    }
    
    let newEmbedCode;
    do {
      newEmbedCode = getRandomEmbedCode();
    } while (newEmbedCode === currentEmbedCode);
    
    console.log(`Shuffling from ${currentEmbedCode} to ${newEmbedCode}`);
    setIsShuffling(true);
    
    try {
      // Step 1: Destroy current widget completely
      destroyCurrentWidget();
      
      // Step 2: Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 3: Update state
      setCurrentEmbedCode(newEmbedCode);
      setLastShuffleTime(Date.now());
      
      // Step 4: Create fresh widget with new agent
      await new Promise(resolve => setTimeout(resolve, 200));
      createFreshWidget(newEmbedCode);
      
      console.log(`Successfully shuffled to agent: ${newEmbedCode}`);
    } catch (error) {
      console.error('Error during shuffle:', error);
    } finally {
      setIsShuffling(false);
    }
  }, [currentEmbedCode, getRandomEmbedCode, embedCodes, failedAgents, destroyCurrentWidget, createFreshWidget]);

  // Function to handle agent failures with complete widget replacement
  const handleAgentError = useCallback(async (agentId: string) => {
    console.warn(`Agent ${agentId} failed, marking as failed and switching`);
    setFailedAgents(prev => new Set([...prev, agentId]));
    
    // Try to switch to a working agent
    const workingEmbeds = embedCodes.filter(code => !failedAgents.has(code) && code !== agentId);
    if (workingEmbeds.length > 0) {
      const fallbackAgent = workingEmbeds[0];
      
      try {
        setIsShuffling(true);
        
        // Destroy current widget
        destroyCurrentWidget();
        
        // Wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Update state and create fresh widget
        setCurrentEmbedCode(fallbackAgent);
        await new Promise(resolve => setTimeout(resolve, 200));
        createFreshWidget(fallbackAgent);
        
        console.log(`Switched to fallback agent: ${fallbackAgent}`);
      } catch (error) {
        console.error('Error switching to fallback agent:', error);
      } finally {
        setIsShuffling(false);
      }
    }
  }, [embedCodes, failedAgents, destroyCurrentWidget, createFreshWidget]);

  // Manual shuffle function
  const handleManualShuffle = useCallback(() => {
    if (isShuffling) {
      console.log('Shuffle already in progress, skipping...');
      return;
    }
    shuffleEmbed();
  }, [shuffleEmbed, isShuffling]);

  // Function to force widget containment
  const forceWidgetContainment = useCallback(() => {
    if (!widgetInstanceRef.current) return;
    
    const widget = widgetInstanceRef.current;
    
    // Apply containment styles
    widget.style.cssText = `
      position: relative !important;
      width: 100% !important;
      height: 100% !important;
      max-width: 100% !important;
      max-height: 100% !important;
      overflow: hidden !important;
      display: block !important;
      contain: layout style paint !important;
      isolation: isolate !important;
      top: 0 !important;
      left: 0 !important;
      right: auto !important;
      bottom: auto !important;
      transform: none !important;
      z-index: 1 !important;
    `;
    
    // Also apply to all child elements
    const applyToChildren = (element: Element) => {
      Array.from(element.children).forEach(child => {
        const childElement = child as HTMLElement;
        childElement.style.position = 'relative';
        childElement.style.maxWidth = '100%';
        childElement.style.maxHeight = '100%';
        childElement.style.top = 'auto';
        childElement.style.left = 'auto';
        childElement.style.right = 'auto';
        childElement.style.bottom = 'auto';
        childElement.style.transform = 'none';
        applyToChildren(child);
      });
    };
    
    applyToChildren(widget);
  }, []);

  // Handle message visibility timing
  useEffect(() => {
    // Clear existing timeouts
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }

    // Show message after 6.5 seconds
    messageTimeoutRef.current = setTimeout(() => {
      if (!isHovered) {
        setShowMessage(true);
        // Auto-hide after 4 seconds if not hovered
        hideTimeoutRef.current = setTimeout(() => {
          if (!isHovered) {
            setShowMessage(false);
          }
        }, 4000);
      }
    }, 6500);

    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [isHovered]);

  // Handle hover state
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    setShowMessage(true);
    // Clear hide timeout when hovering
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    // Hide message after a short delay when leaving hover
    hideTimeoutRef.current = setTimeout(() => {
      setShowMessage(false);
    }, 300);
  }, []);

  useEffect(() => {
    // Load the ElevenLabs script
    if (!document.getElementById('elevenlabs-convai-widget')) {
      const script = document.createElement('script');
      script.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
      script.async = true;
      script.type = "text/javascript";
      script.id = "elevenlabs-convai-widget";
      
      script.onload = () => {
        setIsScriptLoaded(true);
        console.log('ElevenLabs script loaded successfully');
      };
      
      script.onerror = () => {
        console.error('Failed to load ElevenLabs script');
      };
      
      document.body.appendChild(script);
    } else {
      setIsScriptLoaded(true);
    }
  }, []);

  // Create initial widget when script is loaded
  useEffect(() => {
    if (isScriptLoaded && !widgetInstanceRef.current) {
      setTimeout(() => {
        createFreshWidget(currentEmbedCode);
      }, 500);
    }
  }, [isScriptLoaded, createFreshWidget, currentEmbedCode]);

  // Set up 6-minute interval for shuffling
  useEffect(() => {
    if (embedCodes.length > 1 && isScriptLoaded && widgetInstanceRef.current) {
      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // Set up 6-minute interval for shuffling
      intervalRef.current = window.setInterval(() => {
        console.log('6-minute timer triggered - shuffling embed');
        shuffleEmbed();
      }, 6 * 60 * 1000); // 6 minutes in milliseconds

      console.log('Shuffle interval set up for 6 minutes');
    }

    // Cleanup interval on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [shuffleEmbed, embedCodes.length, isScriptLoaded]);

  // Effect to handle agent errors - listen for console errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.message && event.message.includes('Cannot fetch config for agent')) {
        const match = event.message.match(/agent_([\w]+)/);
        if (match) {
          const failedAgentId = match[0];
          if (failedAgentId === currentEmbedCode) {
            handleAgentError(failedAgentId);
          }
        }
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [currentEmbedCode, handleAgentError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear all timeouts
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      
      // Destroy widget
      destroyCurrentWidget();
    };
  }, [destroyCurrentWidget]);

  // Theme-based styling
  const getContainerClasses = () => {
    switch (currentTheme) {
      case 'light':
        return "w-full h-full bg-gradient-to-br from-slate-50 via-white to-blue-50 rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden relative";
      case 'dark':
        return "w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-900 rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden relative";
      case 'system':
      default:
        return "w-full h-full bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-100 rounded-2xl shadow-2xl border border-slate-300/50 overflow-hidden relative";
    }
  };

  const getButtonClasses = () => {
    const baseClasses = "button-main text-white rounded-full p-3 shadow-lg transition-all duration-300 ease-out";
    const disabledClasses = isShuffling ? "bg-gray-400 cursor-not-allowed" : "";
    
    switch (currentTheme) {
      case 'light':
        return `${baseClasses} ${isShuffling ? disabledClasses : "bg-blue-500 hover:bg-blue-600"}`;
      case 'dark':
        return `${baseClasses} ${isShuffling ? disabledClasses : "bg-indigo-600 hover:bg-indigo-700"}`;
      case 'system':
      default:
        return `${baseClasses} ${isShuffling ? disabledClasses : "bg-slate-600 hover:bg-slate-700"}`;
    }
  };

  const getTooltipClasses = () => {
    switch (currentTheme) {
      case 'light':
        return "bg-white text-slate-700 border border-slate-200 shadow-xl";
      case 'dark':
        return "bg-slate-800 text-white border border-slate-700 shadow-xl";
      case 'system':
      default:
        return "bg-white text-slate-700 border border-slate-200 shadow-xl";
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Optimized Floating Button with Message */}
      {embedCodes.length > 1 && (
        <div 
          className="absolute top-4 left-4 z-20 flex items-center"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <button
            onClick={handleManualShuffle}
            disabled={isShuffling}
            className={getButtonClasses()}
            title={isShuffling ? "Shuffling..." : "Shuffle Agent"}
          >
            <svg 
              className={`w-5 h-5 transition-transform duration-300 ease-out ${isShuffling ? 'animate-spin' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              style={{
                transform: !isShuffling && isHovered ? 'rotate(180deg)' : 'rotate(0deg)'
              }}
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
              />
            </svg>
          </button>
          
          {/* Optimized Message Tooltip */}
          <div 
            className={`
              professional-message ml-3 
              ${getTooltipClasses()}
              ${showMessage ? 'message-visible' : 'message-hidden'}
            `}
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium whitespace-nowrap">
                {isShuffling ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                    Switching agent...
                  </span>
                ) : (
                  "Didn't work? Try refreshing Somya."
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Voice Assistant Container with Theme-based Styling */}
      <div 
        ref={containerRef} 
        className={getContainerClasses()}
        style={{
          contain: 'layout style paint',
          isolation: 'isolate',
          position: 'relative',
          zIndex: 0
        }}
      >
        {/* Professional Loading overlay during shuffle */}
        {isShuffling && (
          <div className="absolute inset-0 bg-gradient-to-br from-black/30 via-black/20 to-black/30 flex items-center justify-center z-30 backdrop-blur-md">
            <div className="loading-container">
              <div className="loading-content">
                {/* Animated icon */}
                <div className="loading-icon-wrapper">
                  <svg className="loading-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <div className="loading-pulse"></div>
                </div>
                
                {/* Text with typing animation */}
                <div className="loading-text">
                  <span className="loading-label">Refreshing Agent</span>
                  <div className="loading-dots">
                    <span className="dot dot-1">.</span>
                    <span className="dot dot-2">.</span>
                    <span className="dot dot-3">.</span>
                  </div>
                </div>
                
                {/* Progress bar */}
                <div className="loading-progress">
                  <div className="progress-bar"></div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Widget Container */}
        <div 
          ref={widgetContainerRef}
          className="w-full h-full relative"
          style={{
            position: 'relative',
            overflow: 'hidden',
            contain: 'layout style paint',
            isolation: 'isolate',
            zIndex: 1
          }}
        />
        
        {/* Containment overlay to catch any escaped elements */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 10,
            background: 'transparent',
            overflow: 'hidden'
          }}
        />
      </div>
      
      {/* Enhanced CSS Styles */}
      <style dangerouslySetInnerHTML={{
        __html: `
          elevenlabs-convai {
            position: relative !important;
            width: 100% !important;
            height: 100% !important;
            max-width: 100% !important;
            max-height: 100% !important;
            overflow: hidden !important;
            display: block !important;
            contain: layout style paint !important;
            isolation: isolate !important;
            top: 0 !important;
            left: 0 !important;
            right: auto !important;
            bottom: auto !important;
            transform: none !important;
            z-index: 1 !important;
          }
          
          elevenlabs-convai * {
            position: relative !important;
            max-width: 100% !important;
            max-height: 100% !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;
            bottom: auto !important;
            transform: none !important;
          }
          
          elevenlabs-convai iframe,
          elevenlabs-convai div,
          elevenlabs-convai canvas,
          elevenlabs-convai svg {
            position: relative !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;
            bottom: auto !important;
            transform: none !important;
            max-width: 100% !important;
            max-height: 100% !important;
          }
          
          /* Prevent any absolute/fixed positioning within the widget */
          elevenlabs-convai [style*="position: absolute"],
          elevenlabs-convai [style*="position: fixed"] {
            position: relative !important;
          }
          
          /* Hide any elements that escape to body */
          body > elevenlabs-convai,
          body > div[style*="position: absolute"]:has([data-widget-key]),
          body > div[style*="position: fixed"]:has([data-widget-key]) {
            display: none !important;
          }
          
          /* Ensure widget stays within bounds */
          elevenlabs-convai {
            clip-path: inset(0) !important;
          }

          /* Professional Message Styling */
          .professional-message {
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            backdrop-filter: blur(12px);
            pointer-events: none;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            min-width: max-content;
          }

          /* Message States */
          .message-visible {
            opacity: 1;
            transform: translateX(0) scale(1);
            visibility: visible;
          }

          .message-hidden {
            opacity: 0;
            transform: translateX(-10px) scale(0.95);
            visibility: hidden;
          }

          /* Button States */
          .button-main:hover:not(:disabled) {
            transform: scale(1.05);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
          }

          .button-main:active:not(:disabled) {
            transform: scale(0.98);
          }

          .button-main:disabled {
            transform: none;
            box-shadow: none;
          }

          /* Professional Loading Animations */
          .loading-container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 20px;
            padding: 32px 40px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            animation: loadingFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
          }

          .loading-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            color: white;
          }

          .loading-icon-wrapper {
            position: relative;
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .loading-icon {
            width: 32px;
            height: 32px;
            animation: smoothRotate 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
            z-index: 2;
            position: relative;
          }

          .loading-pulse {
            position: absolute;
            inset: 0;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            animation: pulseGrow 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          }

          .loading-text {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 16px;
            font-weight: 600;
            letter-spacing: 0.5px;
          }

          .loading-label {
            background: linear-gradient(90deg, #ffffff, #e0e7ff, #ffffff);
            background-size: 200% 100%;
            background-clip: text;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: shimmer 2s ease-in-out infinite;
          }

          .loading-dots {
            display: flex;
            gap: 2px;
          }

          .dot {
            font-size: 20px;
            animation: dotBounce 1.4s ease-in-out infinite both;
            color: rgba(255, 255, 255, 0.8);
          }

          .dot-1 { animation-delay: -0.32s; }
          .dot-2 { animation-delay: -0.16s; }
          .dot-3 { animation-delay: 0s; }

          .loading-progress {
            width: 200px;
            height: 3px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 2px;
            overflow: hidden;
            position: relative;
          }

          .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, 
              transparent,
              rgba(255, 255, 255, 0.6),
              rgba(255, 255, 255, 0.8),
              rgba(255, 255, 255, 0.6),
              transparent
            );
            background-size: 50% 100%;
            animation: progressSweep 1.5s ease-in-out infinite;
            border-radius: 2px;
          }

          /* Keyframe Animations */
          @keyframes loadingFadeIn {
            0% {
              opacity: 0;
              transform: scale(0.9) translateY(20px);
            }
            100% {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }

          @keyframes smoothRotate {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          @keyframes pulseGrow {
            0%, 100% {
              transform: scale(1);
              opacity: 0.3;
            }
            50% {
              transform: scale(1.3);
              opacity: 0.1;
            }
          }

          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }

          @keyframes dotBounce {
            0%, 80%, 100% {
              transform: scale(0.8);
              opacity: 0.5;
            }
            40% {
              transform: scale(1.1);
              opacity: 1;
            }
          }

          @keyframes progressSweep {
            0% {
              transform: translateX(-100%);
            }
            100% {
              transform: translateX(200%);
            }
          }

          /* Spin animation for button */
          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }

          .animate-spin {
            animation: spin 1s linear infinite;
          }

          /* Enhanced entrance animation */
          @keyframes messageSlideIn {
            0% {
              opacity: 0;
              transform: translateX(-20px) scale(0.9);
            }
            60% {
              opacity: 0.8;
              transform: translateX(3px) scale(1.02);
            }
            100% {
              opacity: 1;
              transform: translateX(0) scale(1);
            }
          }

          .message-visible {
            animation: messageSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
          }

          /* Responsive Loading Adjustments */
          @media (max-width: 768px) {
            .loading-container {
              padding: 24px 28px;
              border-radius: 16px;
            }
            
            .loading-content {
              gap: 16px;
            }
            
            .loading-icon-wrapper {
              width: 40px;
              height: 40px;
            }
            
            .loading-icon {
              width: 28px;
              height: 28px;
            }
            
            .loading-text {
              font-size: 14px;
            }
            
            .loading-progress {
              width: 160px;
              height: 2px;
            }
            
            .professional-message {
              font-size: 12px;
              padding: 8px 12px;
            }
            
            .professional-message span {
              font-size: 12px;
            }
            
            .professional-message svg {
              width: 14px;
              height: 14px;
            }
          }

          @media (max-width: 480px) {
            .loading-container {
              padding: 20px 24px;
              border-radius: 12px;
            }
            
            .loading-content {
              gap: 12px;
            }
            
            .loading-icon-wrapper {
              width: 36px;
              height: 36px;
            }
            
            .loading-icon {
              width: 24px;
              height: 24px;
            }
            
            .loading-text {
              font-size: 13px;
            }
            
            .loading-progress {
              width: 120px;
            }
            
            .professional-message {
              font-size: 11px;
              padding: 6px 10px;
            }
            
            .professional-message span {
              font-size: 11px;
            }
            
            .professional-message svg {
              width: 12px;
              height: 12px;
            }
          }

          @media (max-width: 360px) {
            .loading-container {
              padding: 16px 20px;
            }
            
            .loading-text {
              font-size: 12px;
            }
            
            .loading-progress {
              width: 100px;
            }
            
            .professional-message {
              font-size: 10px;
              padding: 5px 8px;
            }
            
            .professional-message span {
              font-size: 10px;
            }
          }
        `
      }} />
    </div>
  );
};

export default VoiceAssistant;
