import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppErrorBoundary, FatalErrorScreen } from './AppErrorBoundary';
import { gearSnapshot } from '@xiv-gear-lab/data';
import { bootstrapDataRuntime } from './data-runtime';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
try {
  const dataRuntime = await bootstrapDataRuntime(gearSnapshot);
  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <App dataRuntime={dataRuntime} />
      </AppErrorBoundary>
    </StrictMode>
  );
} catch (error) {
  console.error('XIV Gear Lab bootstrap error', error);
  root.render(<FatalErrorScreen error={error} />);
}
