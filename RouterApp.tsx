/** Public rider routes. Unknown paths always return visitors to the rider app. */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import App from './App';
import { TransitProvider } from './context/TransitProvider';
import { PUBLIC_RIDER_PATH, publicRiderPath } from './utils/publicRouting';

function RedirectToRider() {
  const location = useLocation();
  return <Navigate to={publicRiderPath(location.pathname)} replace />;
}

export function RouterApp() {
  return (
    <BrowserRouter>
      <TransitProvider>
        <div className="h-full flex flex-col min-h-0">
        <Routes>
          <Route path={PUBLIC_RIDER_PATH} element={<App />} />
          <Route path="*" element={<RedirectToRider />} />
        </Routes>
        </div>
      </TransitProvider>
    </BrowserRouter>
  );
}
