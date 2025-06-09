import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTheme } from "next-themes";

const VoiceAssistant = () => {
  const { theme, resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<number | null>(null);
  const widgetInstanceRef = useRef<HTMLElement | null>(null);
  
  // Wrap embedCodes in useMemo to prevent unnecessary re-renders
  const embedCodes = useMemo(() => [
    "agent_01jx1y8azzfkgtk0v3efdj8crb", // Start with working one
    "agent_01jx7x8bstetcsx349p70ps2fn",
    // Add new agent IDs here - just the ID part from your embed codes
    // "agent_YOUR_NEW_ID_HERE",
    // "agent_ANOTHER_ID_HERE",
    // ... add millions more as needed
  ], []);

  // State to track current embed code - initialize with first embed code
  const [currentEmbedCode, setCurrentEmbedCode] = useState(embedCodes[0]);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [failedAgents, setFailedAgents] = useState<Set<string>>(new Set());
  const [lastShuffleTime, setLastShuffleTime] = useState(Date.now());

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

  // Function to shuffle to a new embed code without destroying the widget
  const shuffleEmbed = useCallback(() => {
    const workingEmbeds = embedCodes.filter(code => !failedAgents.has(code));
    if (workingEmbeds.length <= 1) return;
    
    let newEmbedCode;
    do {
      newEmbedCode = getRandomEmbedCode();
    } while (newEmbedCode === currentEmbedCode);
    
    // Update the agent-id attribute instead of recreating the element
    if (widgetInstanceRef.current) {
      widgetInstanceRef.current.setAttribute('agent-id', newEmbedCode);
      console.log(`Updated agent to: ${newEmbedCode}`);
    }
    
    setCurrentEmbedCode(newEmbedCode);
    setLastShuffleTime(Date.now());
  }, [currentEmbedCode, getRandomEmbedCode, embedCodes, failedAgents]);

  // Function to handle agent failures
  const handleAgentError = useCallback((agentId: string) => {
    console.warn(`Agent ${agentId} failed, marking as failed and switching`);
    setFailedAgents(prev => new Set([...prev, agentId]));
    
    // Try to switch to a working agent
    const workingEmbeds = embedCodes.filter(code => !failedAgents.has(code) && code !== agentId);
    if (workingEmbeds.length > 0) {
      const fallbackAgent = workingEmbeds[0];
      if (widgetInstanceRef.current) {
        widgetInstanceRef.current.setAttribute('agent-id', fallbackAgent);
      }
      setCurrentEmbedCode(fallbackAgent);
      console.log(`Switched to fallback agent: ${fallbackAgent}`);
    }
  }, [embedCodes, failedAgents]);

  // Manual shuffle function
  const handleManualShuffle = useCallback(() => {
    shuffleEmbed();
  }, [shuffleEmbed]);

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

  // Create widget only once
  const createWidget = useCallback(() => {
    if (!widgetContainerRef.current || !isScriptLoaded || widgetInstanceRef.current) return;

    // Create DOM element directly to avoid React re-rendering issues
    const widgetElement = document.createElement('elevenlabs-convai');
    widgetElement.setAttribute('agent-id', currentEmbedCode);
    
    widgetContainerRef.current.appendChild(widgetElement);
    widgetInstanceRef.current = widgetElement;
    
    // Apply containment after a short delay to let the widget initialize
    setTimeout(() => {
      forceWidgetContainment();
      // Set up mutation observer to maintain containment
      const observer = new MutationObserver(() => {
        forceWidgetContainment();
      });
      observer.observe(widgetElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }, 1000);
    
    console.log(`Widget created with agent: ${currentEmbedCode}`);
  }, [isScriptLoaded, currentEmbedCode, forceWidgetContainment]);

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

  // Create widget when script is loaded
  useEffect(() => {
    if (isScriptLoaded) {
      setTimeout(createWidget, 500); // Small delay to ensure script is fully initialized
    }
  }, [isScriptLoaded, createWidget]);

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

  // Cleanup widget on unmount
  useEffect(() => {
    return () => {
      if (widgetInstanceRef.current && widgetContainerRef.current) {
        widgetContainerRef.current.removeChild(widgetInstanceRef.current);
        widgetInstanceRef.current = null;
      }
    };
  }, []);

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
    switch (currentTheme) {
      case 'light':
        return "absolute top-4 left-4 z-20 bg-blue-500 hover:bg-blue-600 text-white rounded-full p-3 shadow-lg transition-all duration-200 hover:scale-110 hover:shadow-xl";
      case 'dark':
        return "absolute top-4 left-4 z-20 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-3 shadow-lg transition-all duration-200 hover:scale-110 hover:shadow-xl";
      case 'system':
      default:
        return "absolute top-4 left-4 z-20 bg-slate-600 hover:bg-slate-700 text-white rounded-full p-3 shadow-lg transition-all duration-200 hover:scale-110 hover:shadow-xl";
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Floating Manual Shuffle Button - Top Left */}
      {embedCodes.length > 1 && (
        <button
          onClick={handleManualShuffle}
          className={getButtonClasses()}
          title="Shuffle Agent"
        >
          <svg 
            className="w-5 h-5" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
            />
          </svg>
        </button>
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
      
      {/* Enhanced CSS to force widget containment */}
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
          body > div[style*="position: absolute"],
          body > div[style*="position: fixed"] {
            display: none !important;
          }
          
          /* Ensure widget stays within bounds */
          elevenlabs-convai {
            clip-path: inset(0) !important;
          }
        `
      }} />
    </div>
  );
};

export default VoiceAssistant;
