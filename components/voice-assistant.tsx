import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTheme } from "next-themes";

const VoiceAssistant = () => {
  const { theme, resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<number | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  
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
  const [isVisible, setIsVisible] = useState(false);
  const [failedAgents, setFailedAgents] = useState<Set<string>>(new Set());

  // Determine current theme state
  const getCurrentTheme = () => {
    if (theme === 'system') {
      return resolvedTheme || 'dark'; // fallback to dark if resolvedTheme is undefined
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

  // Function to shuffle to a new embed code
  const shuffleEmbed = useCallback(() => {
    const workingEmbeds = embedCodes.filter(code => !failedAgents.has(code));
    if (workingEmbeds.length <= 1) return; // Don't shuffle if only one working embed
    
    let newEmbedCode;
    do {
      newEmbedCode = getRandomEmbedCode();
    } while (newEmbedCode === currentEmbedCode);
    
    setCurrentEmbedCode(newEmbedCode);
    console.log(`Shuffled to new embed: ${newEmbedCode} (visible: ${isVisible})`);
  }, [currentEmbedCode, getRandomEmbedCode, embedCodes, failedAgents, isVisible]);

  // Function to handle agent failures
  const handleAgentError = useCallback((agentId: string) => {
    console.warn(`Agent ${agentId} failed, marking as failed and switching`);
    setFailedAgents(prev => new Set([...prev, agentId]));
    
    // Try to switch to a working agent
    const workingEmbeds = embedCodes.filter(code => !failedAgents.has(code) && code !== agentId);
    if (workingEmbeds.length > 0) {
      const fallbackAgent = workingEmbeds[0];
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
    if (!widgetContainerRef.current) return;
    
    // Find all ElevenLabs widgets on the page
    const allWidgets = document.querySelectorAll('elevenlabs-convai');
    
    allWidgets.forEach((widget) => {
      const widgetElement = widget as HTMLElement;
      
      // Check if this widget is our contained one
      if (widget.getAttribute('data-contained') === 'true') {
        // This is our widget - style it properly
        widgetElement.style.position = 'relative';
        widgetElement.style.width = '100%';
        widgetElement.style.height = '100%';
        widgetElement.style.maxWidth = '100%';
        widgetElement.style.maxHeight = '100%';
        widgetElement.style.overflow = 'hidden';
        widgetElement.style.contain = 'layout style paint';
        widgetElement.style.display = 'block';
        
        // Style child elements
        const children = widgetElement.querySelectorAll('*');
        children.forEach((child) => {
          const childElement = child as HTMLElement;
          childElement.style.position = 'relative';
          childElement.style.maxWidth = '100%';
          childElement.style.maxHeight = '100%';
        });
      } else {
        // This is an escaped widget - hide it
        widgetElement.style.display = 'none';
      }
    });
  }, []);

  // Set up Intersection Observer for visibility detection
  useEffect(() => {
    if (!containerRef.current || !isScriptLoaded) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const wasVisible = isVisible;
          const nowVisible = entry.isIntersecting;
          
          setIsVisible(nowVisible);
          
          // Shuffle when becoming visible (but not on initial load)
          if (!wasVisible && nowVisible && embedCodes.length > 1) {
            console.log('Widget became visible - shuffling embed');
            shuffleEmbed();
          }
        });
      },
      {
        threshold: 0.1, // Trigger when 10% of the element is visible
        rootMargin: '10px' // Add some margin for better detection
      }
    );

    if (containerRef.current) {
      observerRef.current.observe(containerRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [isScriptLoaded, shuffleEmbed, embedCodes.length, isVisible]);

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
        // Force containment after script loads
        setTimeout(forceWidgetContainment, 1000);
      };
      
      script.onerror = () => {
        console.error('Failed to load ElevenLabs script');
      };
      
      document.body.appendChild(script);
    } else {
      setIsScriptLoaded(true);
      setTimeout(forceWidgetContainment, 1000);
    }
  }, [forceWidgetContainment]);

  // Force containment when embed code changes
  useEffect(() => {
    if (isScriptLoaded) {
      setTimeout(forceWidgetContainment, 1000);
    }
  }, [currentEmbedCode, isScriptLoaded, forceWidgetContainment]);

  useEffect(() => {
    // Only set up interval if we have multiple embeds and script is loaded
    if (embedCodes.length > 1 && isScriptLoaded) {
      // Set up 6-minute interval for shuffling
      intervalRef.current = window.setInterval(() => {
        console.log('6-minute timer triggered - shuffling embed');
        shuffleEmbed();
      }, 6 * 60 * 1000); // 6 minutes in milliseconds

      console.log('Shuffle interval set up for 6 minutes');
    }

    // Cleanup interval on unmount or when dependencies change
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
          isolation: 'isolate'
        }}
      >
        {/* Widget Container with Forced Constraints */}
        <div 
          ref={widgetContainerRef}
          className="w-full h-full relative"
          style={{
            position: 'relative',
            overflow: 'hidden',
            contain: 'layout style paint',
            isolation: 'isolate'
          }}
        >
          {React.createElement('elevenlabs-convai', {
            key: currentEmbedCode, // Force re-render when embed changes
            'agent-id': currentEmbedCode,
            'data-contained': 'true', // Mark as contained
            onError: () => handleAgentError(currentEmbedCode), // Handle widget-level errors
            style: {
              width: '100%',
              height: '100%',
              maxWidth: '100%',
              maxHeight: '100%',
              position: 'relative',
              overflow: 'hidden',
              contain: 'layout style paint'
            }
          })}
        </div>
        
        {/* Overlay to catch any escaped elements */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 1,
            background: 'transparent'
          }}
        />
      </div>
      
      {/* Global CSS to force widget containment */}
      <style dangerouslySetInnerHTML={{
        __html: `
          elevenlabs-convai {
            position: relative !important;
            width: 100% !important;
            height: 100% !important;
            max-width: 100% !important;
            max-height: 100% !important;
            overflow: hidden !important;
            contain: layout style paint !important;
            display: block !important;
          }
          
          elevenlabs-convai * {
            max-width: 100% !important;
            max-height: 100% !important;
            position: relative !important;
          }
          
          elevenlabs-convai iframe,
          elevenlabs-convai div,
          elevenlabs-convai canvas {
            position: relative !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;
            bottom: auto !important;
            transform: none !important;
          }
          
          /* Hide any elements that try to escape */
          body > elevenlabs-convai:not([data-contained="true"]) {
            display: none !important;
          }
        `
      }} />
    </div>
  );
};

export default VoiceAssistant;
