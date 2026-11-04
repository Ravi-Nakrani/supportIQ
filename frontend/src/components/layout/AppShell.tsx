import React from 'react';
import { Header } from './Header.js';
import { Footer } from './Footer.js';

export interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg-app)',
      }}
    >
      <Header />
      <main
        id="main-content"
        role="main"
        style={{
          flex: 1,
          width: '100%',
          maxWidth: '960px',
          margin: '0 auto',
          padding: '2rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </main>
      <Footer />
    </div>
  );
};

