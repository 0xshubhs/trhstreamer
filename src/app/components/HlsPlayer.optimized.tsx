// 🚀 OPTIMIZED VERSION - Performance Improvements Applied
// Changes:
// 1. Bandwidth-aware quality selection
// 2. Optimized buffer settings
// 3. Network error recovery with retry
// 4. Reduced console logging

'use client';

import { useEffect, useRef, useState } from 'react';

interface HlsPlayerProps {
  m3u8Url: string;
  onError: (error: string) => void;
}

interface QualityLevel {
  height: number;
  bitrate: number;
  index: number;
}

// Logger utility - only logs in development
const logger = {
  log: (...args: unknown[]) => process.env.NODE_ENV === 'development' && console.log(...args),
  warn: (...args: unknown[]) => process.env.NODE_ENV === 'development' && console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};

export default function HlsPlayer({ m3u8Url, onError }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [bandwidthEstimate, setBandwidthEstimate] = useState<number>(0);
  const retryCountRef = useRef<number>(0);

  const MAX_RETRIES = 3;

  useEffect(() => {
    logger.log('=== HLS PLAYER: Component mounted ===');
    logger.log('HLS URL:', m3u8Url);
    let mounted = true;

    const initHls = async () => {
      logger.log('HLS: Initializing player...');
      
      // Add a small delay to ensure video ref is ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (!videoRef.current) {
        logger.error('HLS: Video ref is null after delay!');
        onError('Video element not ready');
        return;
      }

      logger.log('HLS: Video ref is ready');

      // Check if browser natively supports HLS (Safari)
      if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        logger.log('HLS: Browser supports native HLS playback');
        videoRef.current.src = m3u8Url;
        setLoading(false);
        return;
      }

      // Use hls.js for browsers that don't natively support HLS
      try {
        logger.log('HLS: Importing hls.js...');
        const Hls = (await import('hls.js')).default;
        logger.log('HLS: hls.js imported successfully');

        if (!Hls.isSupported()) {
          logger.error('HLS: hls.js is not supported in this browser');
          onError('HLS is not supported in this browser');
          setLoading(false);
          return;
        }

        if (!mounted) {
          logger.log('HLS: Component unmounted, aborting');
          return;
        }

        logger.log('HLS: Creating Hls instance with optimized config...');
        
        // 🚀 OPTIMIZATION 1: Bandwidth-aware adaptive bitrate configuration
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          
          // Adaptive bitrate configuration
          startLevel: -1, // Auto-select based on bandwidth estimation
          maxBufferLength: 30, // 30 seconds max buffer
          maxMaxBufferLength: 60, // 60 seconds absolute max
          backBufferLength: 10, // Keep 10s of played content
          
          // Bandwidth estimation tuning
          abrEWMADefaultEstimate: 500000, // Conservative 500kbps start estimate
          abrBandWidthFactor: 0.95, // Use 95% of measured bandwidth
          abrBandWidthUpFactor: 0.7, // More conservative upswitch (prevent quality jumps)
          
          // Faster fragment loading with reasonable timeouts
          manifestLoadingTimeOut: 10000,
          manifestLoadingMaxRetry: 2,
          levelLoadingTimeOut: 10000,
          levelLoadingMaxRetry: 3,
          fragLoadingTimeOut: 20000,
          fragLoadingMaxRetry: 3,
        });

        hlsRef.current = hls;

        logger.log('HLS: Loading source:', m3u8Url);
        hls.loadSource(m3u8Url);
        logger.log('HLS: Attaching media to video element');
        hls.attachMedia(videoRef.current);

        hls.on(Hls.Events.MANIFEST_PARSED, (_event: any, data: any) => {
          logger.log('=== HLS: Manifest parsed successfully ===');
          logger.log('HLS: Levels available:', data.levels.length);
          if (!mounted) {
            logger.log('HLS: Component unmounted during manifest parse');
            return;
          }
          
          setLoading(false);

          // Extract quality levels
          if (data.levels && data.levels.length > 1) {
            const levelList: QualityLevel[] = data.levels.map((level: any, index: number) => ({
              height: level.height,
              bitrate: level.bitrate,
              index,
            }));
            logger.log('HLS: Quality levels:', levelList);
            setQualities(levelList);
            setCurrentQuality(hls.currentLevel);
          }
        });

        // 🚀 OPTIMIZATION 2: Bandwidth monitoring
        hls.on(Hls.Events.FRAG_LOADED, (_event: any, data: any) => {
          const bandwidth = (data.frag.bytes * 8) / data.frag.duration;
          const bandwidthMbps = bandwidth / 1000000;
          logger.log(`HLS: Estimated bandwidth: ${bandwidthMbps.toFixed(2)} Mbps`);
          setBandwidthEstimate(Math.round(bandwidthMbps * 100) / 100);
        });

        // 🚀 OPTIMIZATION 3: Enhanced error recovery
        hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
          logger.error('=== HLS: Error event ===');
          logger.error('HLS: Error type:', data.type);
          logger.error('HLS: Error details:', data.details);
          logger.error('HLS: Fatal:', data.fatal);
          
          if (!mounted) return;

          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                logger.error('HLS: Network error, attempting recovery...');
                
                if (retryCountRef.current < MAX_RETRIES) {
                  retryCountRef.current++;
                  const delay = Math.pow(2, retryCountRef.current) * 1000; // Exponential backoff
                  logger.log(`HLS: Retry ${retryCountRef.current}/${MAX_RETRIES} in ${delay}ms`);
                  
                  setTimeout(() => {
                    if (mounted && hls) {
                      hls.startLoad();
                    }
                  }, delay);
                  
                  onError(`Network error loading stream (retry ${retryCountRef.current}/${MAX_RETRIES})`);
                } else {
                  onError('Network error loading HLS stream. Maximum retries reached.');
                  hls.destroy();
                }
                break;
                
              case Hls.ErrorTypes.MEDIA_ERROR:
                logger.error('HLS: Media error, attempting recovery...');
                
                if (retryCountRef.current < MAX_RETRIES) {
                  retryCountRef.current++;
                  hls.recoverMediaError();
                  onError(`Media error in stream (attempting recovery ${retryCountRef.current}/${MAX_RETRIES})`);
                } else {
                  onError('Media error in HLS stream. Maximum retries reached.');
                  hls.destroy();
                }
                break;
                
              default:
                logger.error('HLS: Fatal error, destroying player');
                onError('Fatal error loading HLS stream');
                hls.destroy();
                break;
            }
          }
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_event: any, data: any) => {
          logger.log('HLS: Level switched to:', data.level);
          if (mounted) {
            setCurrentQuality(data.level);
            // Reset retry counter on successful switch
            retryCountRef.current = 0;
          }
        });

      } catch (err) {
        if (mounted) {
          onError(`Failed to initialize HLS: ${err instanceof Error ? err.message : 'Unknown error'}`);
          setLoading(false);
        }
      }
    };

    initHls();

    return () => {
      mounted = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [m3u8Url, onError]);

  const handleQualityChange = (levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setCurrentQuality(levelIndex);
    }
  };

  const formatBitrate = (bitrate: number): string => {
    return (bitrate / 1000).toFixed(0) + ' kbps';
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <div className="aspect-video bg-gray-900 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-white">Loading HLS stream...</p>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            className="w-full aspect-video bg-black"
            controls
            autoPlay
            playsInline
          />
        )}

        {qualities.length > 0 && (
          <div className="p-4 bg-gray-50">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold">Quality:</label>
              {bandwidthEstimate > 0 && (
                <span className="text-xs text-gray-600">
                  Bandwidth: ~{bandwidthEstimate} Mbps
                </span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleQualityChange(-1)}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  currentQuality === -1
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Auto
              </button>
              {qualities.map((quality) => (
                <button
                  key={quality.index}
                  onClick={() => handleQualityChange(quality.index)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    currentQuality === quality.index
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {quality.height}p ({formatBitrate(quality.bitrate)})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
