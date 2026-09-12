import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import LimiteErreur from './LimiteErreur.jsx';
import './styles.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
ReactDOM.createRoot(document.getElementById('root')).render(
  <LimiteErreur><App /></LimiteErreur>
);
