import React from 'react';
import { createRoot } from 'react-dom/client';

import { Viewer } from './Viewer.js';

const container = document.getElementById('root');
if (!container) throw new Error('#root element missing');
createRoot(container).render(
  <React.StrictMode>
    <Viewer />
  </React.StrictMode>,
);
