import React, { useEffect, useRef, useState, useCallback } from 'react';

const VoiceAssistant = () => {
  const containerRef = useRef(null);
  const intervalRef = useRef(null);
  
  // Add all your embed agent IDs here - easy to maintain!
  // Just copy the agent-id from your ElevenLabs embed codes
  const embedCodes = [
    "agent_01jx7x8bstetcsx349p70ps2fn", // Your current working embed
    // Add new agent IDs here - just the ID part from your embed codes
    // "agent_YOUR_NEW_ID_HERE",
    // "agent_ANOTHER_ID_HERE",
    // ... add millions more as needed
  ];

  // Function to get a random embed code
  const getRandomEmbedCode = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * embedCodes.length);
    return embedCodes[randomIndex];
  }, [embedCodes]);

  // State to track current embed code
  const [currentEmbedCode, setCurrentEmbedCode] = useState(() => getRandomEmbedCode());

  // Function to shuffle to a new embed code
  const shuffleEmbed = useCallback(() => {
    let newEmbedCode;
    do {
      newEmbedCode = getRandomEmbedCode();
    } while (newEmbedCode === currentEmbedCode && embedCodes.length > 1);
    
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
      document.body.appendChild(script);
    }

    // Set up 10-minute interval for shuffling
    intervalRef.current = setInterval(() => {
      shuffleEmbed();
    }, 10 * 60 * 1000); // 10 minutes in milliseconds

    // Cleanup interval on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [shuffleEmbed]);

  // Shuffle on component mount (every render)
  useEffect(() => {
    shuffleEmbed();
  }, []); // Empty dependency array means this runs once on mount

  return (
    <div ref={containerRef} className="w-full h-full">
      <elevenlabs-convai 
        key={currentEmbedCode} // This forces re-render when embed changes
        agent-id={currentEmbedCode}
      />
    </div>
  );
};

export default VoiceAssistant;
