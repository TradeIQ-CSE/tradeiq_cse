import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RiPauseLine, RiPlayLine } from '@remixicon/react';
import { Button } from '@/components/base/buttons/button';

/** Decorative footage: never a source of market prices or chart data. */
export function LandingBackdrop() {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotionAllowed(!preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !motionAllowed) return;
    let inView = true;
    const syncPlayback = () => {
      if (inView && !document.hidden && !userPaused) {
        void video.play().catch(() => setPlaying(false));
      } else {
        video.pause();
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncPlayback();
    });
    observer.observe(video);
    document.addEventListener('visibilitychange', syncPlayback);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
      video.pause();
    };
  }, [motionAllowed, userPaused]);

  return (
    <>
      <div className="landing-backdrop pointer-events-none absolute inset-0 -z-20" aria-hidden="true">
        <img src="/media/market-backdrop.jpg" alt="" className="absolute size-full object-cover" fetchPriority="high" />
        {motionAllowed && <video ref={videoRef} poster="/media/market-backdrop.jpg" autoPlay muted loop playsInline preload="auto" tabIndex={-1} className="absolute size-full object-cover" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}>
          <source src="/media/market-backdrop.webm" type="video/webm" />
          <source src="/media/market-backdrop.mp4" type="video/mp4" />
        </video>}
      </div>
      <div className="landing-backdrop-tint pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      {motionAllowed && (
        <Button variant="secondary" iconOnly leadingIcon={playing ? RiPauseLine : RiPlayLine} className="landing-video-control absolute bottom-5 right-5 z-10 size-11 rounded-full" aria-label={t(playing ? 'landing.hero.pauseVideo' : 'landing.hero.playVideo')} onClick={() => {
          setUserPaused(playing);
          if (playing) videoRef.current?.pause();
          else void videoRef.current?.play().catch(() => setPlaying(false));
        }} />
      )}
    </>
  );
}
