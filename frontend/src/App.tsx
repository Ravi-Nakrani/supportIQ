import React from 'react';
import { AppShell } from './components/layout/AppShell.js';
import { PlaceholderHero } from './components/chat/PlaceholderHero.js';

export const App: React.FC = () => {
  return (
    <AppShell>
      <PlaceholderHero />
    </AppShell>
  );
};

export default App;

