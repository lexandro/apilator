import { useState, useEffect } from 'react';
import './SplashScreen.css';

interface SplashScreenProps {
  onFinished: () => void;
  minDuration?: number;
}

export function SplashScreen({ onFinished, minDuration = 1500 }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      // Wait for fade animation to complete
      setTimeout(onFinished, 300);
    }, minDuration);

    return () => clearTimeout(timer);
  }, [onFinished, minDuration]);

  return (
    <div className={`splash-screen ${fadeOut ? 'fade-out' : ''}`}>
      <img
        src="/apilator_splash.png"
        alt="Apilator"
        className="splash-image"
      />
    </div>
  );
}
