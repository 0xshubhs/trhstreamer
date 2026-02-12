import { useState, useEffect } from 'react';

interface ServerStatus {
  serverAvailable: boolean;
  serverUrl: string;
  checking: boolean;
}

const SERVER_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:8080')
    : 'http://localhost:8080';

const HEALTH_TIMEOUT = 3000;

export function useServerStatus(): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>({
    serverAvailable: false,
    serverUrl: SERVER_URL,
    checking: true,
  });

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);

    fetch(`${SERVER_URL}/health`, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timer);
        setStatus({ serverAvailable: res.ok, serverUrl: SERVER_URL, checking: false });
      })
      .catch(() => {
        clearTimeout(timer);
        setStatus({ serverAvailable: false, serverUrl: SERVER_URL, checking: false });
      });

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  return status;
}
