// 🚀 BANDWIDTH OPTIMIZED VERSION
// Addresses: ~1 Mbps → 5-10 Mbps+ target
// Key fixes:
// 1. Enhanced tracker + STUN/TURN configuration
// 2. Increased connection limits (55 → 100)
// 3. Aggressive piece prioritization for parallelism
// 4. Detailed peer diagnostics and quality monitoring
// 5. Adaptive lookahead buffering
// 6. Peer type detection (WebRTC vs TCP)

'use client';

import { useEffect, useRef, useState, useMemo } from 'react';

interface TorrentPlayerProps {
  magnet: string;
  onError: (error: string) => void;
}

interface TorrentFile {
  name: string;
  length: number;
}

interface TorrentStats {
  progress: number;
  downloadSpeed: number;
  numPeers: number;
  uploadSpeed?: number;
  ratio?: number;
}

interface PeerQuality {
  totalPeers: number;
  activePeers: number;
  chokingUs: number;
  fastPeers: number;
  avgSpeed: number;
  webrtcPeers: number;
  tcpPeers: number;
}

const logger = {
  log: (...args: unknown[]) => process.env.NODE_ENV === 'development' && console.log(...args),
  warn: (...args: unknown[]) => process.env.NODE_ENV === 'development' && console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};

export default function TorrentPlayer({ magnet, onError }: TorrentPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TorrentStats>({ 
    progress: 0, 
    downloadSpeed: 0, 
    numPeers: 0,
    uploadSpeed: 0,
    ratio: 0,
  });
  const [peerQuality, setPeerQuality] = useState<PeerQuality | null>(null);
  const [files, setFiles] = useState<TorrentFile[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [bufferingStatus, setBufferingStatus] = useState<string>('Initializing...');
  const [bandwidthHistory, setBandwidthHistory] = useState<number[]>([]);
  
  const clientRef = useRef<any>(null);
  const torrentRef = useRef<any>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const peerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const qualityIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const PEER_DISCOVERY_TIMEOUT = 15000;
  const MIN_BUFFER_PIECES = 5;
  const STATS_UPDATE_INTERVAL = 2000;
  const QUALITY_CHECK_INTERVAL = 10000;

  useEffect(() => {
    logger.log('=== TORRENT PLAYER (BANDWIDTH OPTIMIZED): Component mounted ===');
    logger.log('Magnet link:', magnet);
    let mounted = true;

    const initTorrent = async () => {
      try {
        logger.log('TORRENT: Starting WebTorrent initialization...');
        setBufferingStatus('Loading WebTorrent...');
        
        const WebTorrentModule = await import('webtorrent');
        const WebTorrent = WebTorrentModule.default;
        
        if (!mounted) {
          logger.log('TORRENT: Component unmounted, aborting');
          return;
        }

        logger.log('TORRENT: Creating WebTorrent client with BANDWIDTH OPTIMIZATION config...');
        
        // 🚀 BANDWIDTH OPTIMIZATION 1: Enhanced peer discovery configuration
        const client = new WebTorrent({
          tracker: {
            announce: [
              // 🚀 Public WebSocket trackers for WebRTC peers
              'wss://tracker.openwebtorrent.com',
              'wss://tracker.webtorrent.dev',
              'wss://tracker.btorrent.xyz',
              'wss://tracker.files.fm:7073/announce',
              'wss://tracker.fastcast.nz',
              'wss://tracker.sloppyta.co:443/announce',
            ],
            
            // 🚀 STUN/TURN servers for NAT traversal (critical for bandwidth)
            rtcConfig: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' },
              ],
              iceTransportPolicy: 'all',
              iceCandidatePoolSize: 10,
            },
            
            // 🚀 Request more peers per announce
            getAnnounceOpts() {
              return {
                numwant: 80, // Request 80 peers (default is 50)
                uploaded: 0,
                downloaded: 0,
              };
            },
          },
          
          // 🚀 BANDWIDTH OPTIMIZATION 2: Increase connection limits
          maxConns: 100, // Up from default 55
          
          // 🚀 Enable DHT for additional peer discovery
          dht: true,
          
          // Disable LSD (doesn't work in browser)
          lsd: false,
        });
        
        logger.log('TORRENT: Client created with config:', {
          maxConns: 100,
          trackers: 6,
          stunServers: 4,
        });
        
        clientRef.current = client;
        setBufferingStatus('Connecting to peers...');
        
        // 🚀 Peer discovery timeout
        peerTimeoutRef.current = setTimeout(() => {
          if (torrentRef.current && torrentRef.current.numPeers === 0) {
            logger.warn('TORRENT: No peers found after timeout');
            onError('No peers available after 15s. Try using backend relay mode or check your connection.');
          }
        }, PEER_DISCOVERY_TIMEOUT);

        client.add(magnet, (torrent: any) => {
          logger.log('=== TORRENT: Torrent added successfully ===');
          logger.log('Torrent name:', torrent.name);
          logger.log('Number of files:', torrent.files.length);
          logger.log('Total size:', (torrent.length / 1024 / 1024).toFixed(2), 'MB');
          
          if (!mounted) return;

          torrentRef.current = torrent;

          // Get list of files
          const torrentFiles = torrent.files.map((file: any) => ({
            name: file.name,
            length: file.length,
          }));
          setFiles(torrentFiles);

          // Find first playable video file
          const playableIndex = torrent.files.findIndex((file: any) => 
            /\.(mp4|webm|ogg|mkv)$/i.test(file.name)
          );

          if (playableIndex === -1) {
            logger.error('TORRENT: No playable video file found');
            onError('No playable video file found in torrent');
            setLoading(false);
            return;
          }

          logger.log('TORRENT: Playing file:', torrent.files[playableIndex].name);
          setSelectedFileIndex(playableIndex);
          playFile(torrent.files[playableIndex]);

          // 🚀 BANDWIDTH OPTIMIZATION 3: Throttled stats with bandwidth tracking
          statsIntervalRef.current = setInterval(() => {
            if (!mounted || !torrent) return;
            
            const newStats = {
              progress: torrent.progress * 100,
              downloadSpeed: torrent.downloadSpeed,
              uploadSpeed: torrent.uploadSpeed,
              numPeers: torrent.numPeers,
              ratio: torrent.ratio,
            };
            
            // Track bandwidth history for averaging
            setBandwidthHistory(prev => {
              const updated = [...prev, newStats.downloadSpeed];
              return updated.slice(-60); // Keep last 60 samples (2 min)
            });
            
            // Only update if significant change
            setStats(prevStats => {
              const progressDiff = Math.abs(newStats.progress - prevStats.progress);
              const speedDiff = Math.abs(newStats.downloadSpeed - (prevStats.downloadSpeed || 0));
              const peersDiff = newStats.numPeers !== prevStats.numPeers;
              
              if (progressDiff > 1 || speedDiff > 100000 || peersDiff) {
                logger.log('TORRENT: Stats update:', {
                  speed: (newStats.downloadSpeed / 1024 / 1024).toFixed(2) + ' MB/s',
                  peers: newStats.numPeers,
                  progress: newStats.progress.toFixed(1) + '%',
                });
                return newStats;
              }
              return prevStats;
            });
          }, STATS_UPDATE_INTERVAL);

          // 🚀 BANDWIDTH OPTIMIZATION 4: Peer quality monitoring
          qualityIntervalRef.current = setInterval(() => {
            analyzeConnectionQuality();
          }, QUALITY_CHECK_INTERVAL);

          // Clear peer timeout once peers are found
          torrent.on('wire', (wire: any) => {
            if (torrent.numPeers > 0 && peerTimeoutRef.current) {
              clearTimeout(peerTimeoutRef.current);
              peerTimeoutRef.current = null;
              logger.log('TORRENT: Peers found, timeout cleared');
            }
            
            // Log new peer connection
            logger.log('TORRENT: New peer connected:', {
              type: wire.type || 'unknown',
              peerId: wire.peerId?.toString('hex').slice(0, 8),
            });
          });

          torrent.on('error', (err: Error) => {
            logger.error('TORRENT: Torrent error event:', err);
            if (mounted) {
              onError(`Torrent error: ${err.message}`);
            }
          });
        });

        client.on('error', (err: Error) => {
          logger.error('TORRENT: WebTorrent client error event:', err);
          if (mounted) {
            onError(`WebTorrent error: ${err.message}`);
            setLoading(false);
          }
        });

      } catch (err) {
        logger.error('TORRENT: Failed to initialize:', err);
        if (mounted) {
          onError(`Failed to initialize torrent: ${err instanceof Error ? err.message : 'Unknown error'}`);
          setLoading(false);
        }
      }
    };

    // 🚀 BANDWIDTH OPTIMIZATION 5: Aggressive piece prioritization
    const playFile = (file: any) => {
      logger.log('TORRENT: playFile called for:', file.name);
      
      if (!videoRef.current) {
        logger.error('TORRENT: Video ref is null!');
        return;
      }
      
      const torrent = torrentRef.current;
      if (!torrent) return;
      
      setLoading(true);
      setBufferingStatus('Prioritizing pieces for fast startup...');
      
      // 🚀 Prioritize first 20 pieces with HIGH priority (enables parallelism)
      const STARTUP_PIECES = 20;
      for (let i = 0; i < STARTUP_PIECES; i++) {
        torrent.critical(i, Math.max(0, 20 - i)); // Descending priority
      }
      
      logger.log(`TORRENT: Prioritized first ${STARTUP_PIECES} pieces for parallel download`);
      
      const checkBuffer = () => {
        if (!torrent || !mounted) return;
        
        let piecesBuffered = 0;
        for (let i = 0; i < Math.min(MIN_BUFFER_PIECES, torrent.pieces.length); i++) {
          if (torrent.bitfield.get(i)) {
            piecesBuffered++;
          }
        }
        
        const bufferPercent = Math.round((piecesBuffered / MIN_BUFFER_PIECES) * 100);
        setBufferingStatus(`Buffering: ${bufferPercent}% (${piecesBuffered}/${MIN_BUFFER_PIECES} pieces)`);
        
        if (piecesBuffered >= MIN_BUFFER_PIECES || torrent.progress > 0.1) {
          logger.log('TORRENT: Sufficient buffer, starting playback');
          file.renderTo(videoRef.current, {
            autoplay: true,
            controls: true,
          });
          setLoading(false);
          setBufferingStatus('');
          
          // 🚀 Set up adaptive lookahead during playback
          setupAdaptiveLookahead();
        } else {
          setTimeout(checkBuffer, 500);
        }
      };
      
      checkBuffer();
    };

    // 🚀 BANDWIDTH OPTIMIZATION 6: Adaptive lookahead buffering
    const setupAdaptiveLookahead = () => {
      const video = videoRef.current;
      const torrent = torrentRef.current;
      
      if (!video || !torrent) return;
      
      const LOOKAHEAD_PIECES = 30; // Buffer 30 pieces ahead
      
      const updatePriority = () => {
        if (!video || !torrent) return;
        
        const currentTime = video.currentTime;
        const duration = video.duration;
        
        if (duration && currentTime) {
          const fileProgress = currentTime / duration;
          const totalPieces = torrent.pieces.length;
          const currentPieceIndex = Math.floor(totalPieces * fileProgress);
          
          // Prioritize upcoming pieces with descending priority
          for (let i = 0; i < LOOKAHEAD_PIECES; i++) {
            const pieceIdx = currentPieceIndex + i;
            if (pieceIdx < totalPieces) {
              const priority = Math.max(0, 15 - Math.floor(i / 2));
              torrent.select(pieceIdx, pieceIdx + 1, priority);
            }
          }
          
          logger.log(`TORRENT: Updated lookahead priority for pieces ${currentPieceIndex}-${currentPieceIndex + LOOKAHEAD_PIECES}`);
        }
      };
      
      video.addEventListener('timeupdate', updatePriority);
      video.addEventListener('seeked', updatePriority);
      
      // Initial priority update
      updatePriority();
    };

    // 🚀 BANDWIDTH OPTIMIZATION 7: Connection quality analyzer
    const analyzeConnectionQuality = () => {
      if (!torrentRef.current) return;
      
      const torrent = torrentRef.current;
      const wires = torrent.wires || [];
      
      if (wires.length === 0) {
        logger.warn('⚠️ No peer connections available for analysis');
        return;
      }
      
      const analysis = {
        totalPeers: wires.length,
        activePeers: 0,
        chokingUs: 0,
        fastPeers: 0,
        avgSpeed: 0,
        webrtcPeers: 0,
        tcpPeers: 0,
      };
      
      const peerDetails: any[] = [];
      
      wires.forEach((wire: any) => {
        const downloadSpeed = wire.downloadSpeed();
        
        if (downloadSpeed > 0) analysis.activePeers++;
        if (wire.peerChoking) analysis.chokingUs++;
        
        if (downloadSpeed > 100 * 1024) analysis.fastPeers++; // >100 KB/s = fast
        
        analysis.avgSpeed += downloadSpeed;
        
        // Detect peer type
        if (wire.type === 'webrtc') {
          analysis.webrtcPeers++;
        } else if (wire.type?.includes('tcp')) {
          analysis.tcpPeers++;
        }
        
        peerDetails.push({
          peerId: wire.peerId?.toString('hex').slice(0, 8),
          speed: downloadSpeed,
          choking: wire.peerChoking,
          type: wire.type,
        });
      });
      
      if (analysis.totalPeers > 0) {
        analysis.avgSpeed /= analysis.totalPeers;
      }
      
      setPeerQuality(analysis);
      
      logger.log('=== CONNECTION QUALITY REPORT ===');
      logger.log(`Total peers: ${analysis.totalPeers}`);
      logger.log(`Active (uploading): ${analysis.activePeers} (${(analysis.activePeers / analysis.totalPeers * 100).toFixed(0)}%)`);
      logger.log(`Choking us: ${analysis.chokingUs} (${(analysis.chokingUs / analysis.totalPeers * 100).toFixed(0)}%)`);
      logger.log(`Fast peers (>100 KB/s): ${analysis.fastPeers}`);
      logger.log(`Avg peer speed: ${(analysis.avgSpeed / 1024).toFixed(2)} KB/s`);
      logger.log(`Peer types: WebRTC=${analysis.webrtcPeers}, TCP=${analysis.tcpPeers}`);
      
      // Top 5 fastest peers
      const topPeers = peerDetails
        .sort((a, b) => b.speed - a.speed)
        .slice(0, 5);
      
      logger.log('Top 5 fastest peers:');
      topPeers.forEach((peer, idx) => {
        logger.log(`  ${idx + 1}. ${peer.peerId}: ${(peer.speed / 1024).toFixed(2)} KB/s (${peer.type || 'unknown'}) ${peer.choking ? '🔒 choking' : '✅ active'}`);
      });
      
      // Warnings
      if (analysis.activePeers < analysis.totalPeers * 0.3) {
        logger.warn('⚠️ WARNING: <30% of peers are actively uploading!');
      }
      if (analysis.chokingUs > analysis.totalPeers * 0.5) {
        logger.warn('⚠️ WARNING: >50% of peers are choking you!');
      }
      if (analysis.webrtcPeers === 0) {
        logger.warn('⚠️ WARNING: No WebRTC peers detected. Check STUN/TURN configuration.');
      }
    };

    initTorrent();

    return () => {
      mounted = false;
      
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
      if (peerTimeoutRef.current) clearTimeout(peerTimeoutRef.current);
      if (qualityIntervalRef.current) clearInterval(qualityIntervalRef.current);
      
      if (clientRef.current) {
        logger.log('TORRENT: Destroying client');
        clientRef.current.destroy();
      }
    };
  }, [magnet, onError]);

  // Memoize formatted values
  const formattedSpeed = useMemo(
    () => (stats.downloadSpeed / 1024 / 1024).toFixed(2) + ' MB/s',
    [stats.downloadSpeed]
  );

  const formattedUploadSpeed = useMemo(
    () => (stats.uploadSpeed || 0) > 0 ? ((stats.uploadSpeed || 0) / 1024 / 1024).toFixed(2) + ' MB/s' : '0 MB/s',
    [stats.uploadSpeed]
  );

  const avgBandwidth = useMemo(() => {
    if (bandwidthHistory.length === 0) return 0;
    const sum = bandwidthHistory.reduce((a, b) => a + b, 0);
    return sum / bandwidthHistory.length;
  }, [bandwidthHistory]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <div className="aspect-video bg-gray-900 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-white font-semibold">{bufferingStatus}</p>
              {stats.numPeers > 0 && (
                <p className="text-gray-400 text-sm mt-2">
                  Connected to {stats.numPeers} peer{stats.numPeers !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            className="w-full aspect-video bg-black"
            controls
            playsInline
          />
        )}

        <div className="p-4 bg-gray-50">
          {/* Main stats */}
          <div className="grid grid-cols-3 gap-4 text-sm mb-3">
            <div>
              <span className="font-semibold">Progress:</span>
              <div className="mt-1">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${stats.progress}%` }}
                  />
                </div>
                <span className="text-gray-600">{stats.progress.toFixed(1)}%</span>
              </div>
            </div>
            <div>
              <span className="font-semibold">⬇ Download:</span>
              <p className="text-gray-900 font-mono">{formattedSpeed}</p>
              <p className="text-xs text-gray-500">Avg: {(avgBandwidth / 1024 / 1024).toFixed(2)} MB/s</p>
            </div>
            <div>
              <span className="font-semibold">Peers:</span>
              <p className="text-gray-900">
                {stats.numPeers}
                {peerQuality && (
                  <span className="text-xs text-gray-500 block">
                    Active: {peerQuality.activePeers} ({((peerQuality.activePeers / peerQuality.totalPeers) * 100).toFixed(0)}%)
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Bandwidth diagnostics */}
          {peerQuality && (
            <div className="mb-3 p-2 bg-blue-50 rounded text-xs border border-blue-200">
              <div className="font-semibold mb-1">🔍 Connection Quality:</div>
              <div className="grid grid-cols-2 gap-2">
                <div>Fast peers (&gt;100 KB/s): {peerQuality.fastPeers}</div>
                <div>Avg peer speed: {(peerQuality.avgSpeed / 1024).toFixed(1)} KB/s</div>
                <div>WebRTC peers: {peerQuality.webrtcPeers}</div>
                <div>TCP peers: {peerQuality.tcpPeers}</div>
              </div>
              {peerQuality.chokingUs > peerQuality.totalPeers * 0.5 && (
                <div className="mt-1 text-yellow-700">
                  ⚠️ {peerQuality.chokingUs} peers choking (limiting upload)
                </div>
              )}
            </div>
          )}

          {/* Upload stats */}
          <div className="mb-3 text-xs text-gray-600">
            <span className="font-semibold">⬆ Upload:</span> {formattedUploadSpeed}
            {stats.ratio !== undefined && (
              <span className="ml-2">
                | Ratio: {stats.ratio.toFixed(2)}
              </span>
            )}
          </div>

          {files.length > 1 && (
            <div className="mt-4">
              <label className="block text-sm font-semibold mb-2">Files in torrent:</label>
              <div className="max-h-32 overflow-y-auto">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className={`text-sm p-2 rounded ${
                      index === selectedFileIndex ? 'bg-blue-100' : 'hover:bg-gray-100'
                    }`}
                  >
                    {file.name} ({formatBytes(file.length)})
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
