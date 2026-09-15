import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// 纯静态站点：base 用相对路径，便于在任意子路径或 file:// 环境离线打开。
export default defineConfig({
  base: './',
  plugins: [svelte()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/unit/**/*.test.ts']
  }
});
