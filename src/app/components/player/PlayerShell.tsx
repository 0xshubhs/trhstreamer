'use client';

import { ReactNode } from 'react';

interface PlayerShellProps {
  loading?: boolean;
  loadingText?: string;
  progress?: number;       // 0–1, shown as a progress bar during loading
  loadingInfo?: ReactNode; // extra content below spinner (e.g. peer count, speed)
  error?: string;
  children: ReactNode;
  info?: ReactNode;
}

export default function PlayerShell({
  loading,
  loadingText = 'Loading...',
  progress,
  loadingInfo,
  error,
  children,
  info,
}: PlayerShellProps) {
  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <div className="aspect-video bg-gray-900 flex items-center justify-center">
            <div className="text-center w-full px-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
              <p className="text-white mb-3">{loadingText}</p>

              {progress !== undefined && progress > 0 && (
                <div className="mx-auto w-64">
                  <div className="bg-gray-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                  <p className="text-gray-400 text-xs mt-1">{Math.round(progress * 100)}% downloaded</p>
                </div>
              )}

              {loadingInfo && <div className="mt-3">{loadingInfo}</div>}
            </div>
          </div>
        ) : (
          children
        )}

        {error && (
          <div className="p-4 bg-red-50 border-t border-red-200">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {info && <div className="p-4 bg-gray-50 border-t">{info}</div>}
      </div>
    </div>
  );
}
