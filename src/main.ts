import App from './App.svelte';
import './app.css';

const target = document.getElementById('app');
if (!target) throw new Error('找不到应用挂载点 #app');

export default new App({ target });
