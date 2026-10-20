
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerPwa } from './design/pwa';

declare global {
    interface Window {
        unmountMyWebApp?: () => void;
    }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

registerPwa();

// Assign the unmount function to the window object for Frappe's cleanup script
window.unmountMyWebApp = () => {
    root.unmount();
};
