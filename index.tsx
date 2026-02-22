import 'mapbox-gl/dist/mapbox-gl.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterApp } from './RouterApp';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <RouterApp />
  </React.StrictMode>
);