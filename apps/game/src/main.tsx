import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initI18n } from '@them/i18n';
import { detectLocale, syncHtmlLang } from './ui/lang';
import { initDocumentSettings } from './ui/settings';
import { App } from './App';
import '@them/ui-tokens/tokens.css';
import './styles.css';

void initI18n(detectLocale()).then(syncHtmlLang);
initDocumentSettings();

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
