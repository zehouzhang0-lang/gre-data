import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import App from './App.jsx';
import './design-tokens.css';
import './mobile.css';

createRoot(document.getElementById('root')).render(<App />);
