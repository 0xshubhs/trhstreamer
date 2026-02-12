'use client';

import { ReactNode } from 'react';

interface PlayerShellProps {
  loading?: boolean;
  loadingText?: string;
  error?: string;
  children: ReactNode;
  info?: ReactNode;
}

export default function PlayerShell({
  loading,
  loadingText = 'Loading...',
  error,
  children,
  info,
}: PlayerShellProps) {
  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <div className="aspect-video bg-gray-900 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
              <p className="text-white">{loadingText}</p>
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
