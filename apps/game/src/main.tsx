import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initI18n } from '@them/i18n';
import { App } from './App';
import '@them/ui-tokens/tokens.css';
import './styles.css';

void initI18n();

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
