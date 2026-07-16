import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { gearSnapshot } from '@xiv-gear-lab/data';
import { bootstrapDataRuntime } from './data-runtime';
import './styles.css';

const dataRuntime = await bootstrapDataRuntime(gearSnapshot);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App dataRuntime={dataRuntime} />
  </StrictMode>
);
