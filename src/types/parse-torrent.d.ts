declare module 'parse-torrent' {
  interface TorrentInfo {
    infoHash?: string;
    name?: string;
    length?: number;
    files?: Array<{
      path: string;
      name: string;
      length: number;
    }>;
    announce?: string[];
  }

  function parseTorrent(
    torrent: string | Buffer | Uint8Array | Blob
  ): Promise<TorrentInfo>;

  export = parseTorrent;
}
