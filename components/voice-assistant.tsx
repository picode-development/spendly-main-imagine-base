import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

const VoiceAssistant = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<number | null>(null);
  
  // Wrap embedCodes in useMemo to prevent unnecessary re-renders
  const embedCodes = useMemo(() => [
    "agent_01jx7x8bstetcsx349p70ps2fn", // Your current working embed
    // Add new agent IDs here - just the ID part from your embed codes
    // "agent_YOUR_NEW_ID_HERE",
    // "agent_ANOTHER_ID_HERE",
    // ... add millions more as needed
  ], []);

  // Function to get a random embed code
  const getRandomEmbedCode = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * embedCodes.length);
    return embedCodes[randomIndex];
  }, [embedCodes]);

  // State to track current embed code - initialize with first embed code
  const [currentEmbedCode, setCurrentEmbedCode] = useState(embedCodes[0]);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);

  // Function to shuffle to a new embed code
  const shuffleEmbed = useCallback(() => {
    if (embedCodes.length <= 1) return; // Don't shuffle if only one embed
    
    let newEmbedCode;
    do {
      newEmbedCode = getRandomEmbedCode();
    } while (newEmbedCode === currentEmbedCode);
    
    setCurrentEmbedCode(newEmbedCode);
    console.log(`Shuffled to new embed: ${newEmbedCode}`);
  }, [currentEmbedCode, getRandomEmbedCode, embedCodes.length]);

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

  useEffect(() => {
    // Only set up interval if we have multiple embeds and script is loaded
    if (embedCodes.length > 1 && isScriptLoaded) {
      // Set up 10-minute interval for shuffling
      intervalRef.current = window.setInterval(() => {
        shuffleEmbed();
      }, 10 * 60 * 1000); // 10 minutes in milliseconds

      console.log('Shuffle interval set up for 10 minutes');
    }

    // Cleanup interval on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [shuffleEmbed, embedCodes.length, isScriptLoaded]);



  return (
    <div ref={containerRef} className="w-full h-full">
      {React.createElement('elevenlabs-convai', {
        key: currentEmbedCode, // Force re-render when embed changes
        'agent-id': currentEmbedCode
      })}
    </div>
  );
};

export default VoiceAssistant;
