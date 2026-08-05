// build.js — chạy khi Netlify build ("npm run build"). Đóng gói src/App.jsx
// (React JSX) thành 1 file JS chạy thẳng trên trình duyệt, và biên dịch CSS
// Tailwind cần thiết — không cần React/Vite phía máy chủ, chỉ dùng esbuild.
const esbuild = require('esbuild');
const { execSync } = require('child_process');
const fs = require('fs');

// 1) Tạo file entry.jsx tạm để gắn App vào #root
fs.writeFileSync('src/entry.jsx', `
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
createRoot(document.getElementById('root')).render(<App />);
`);

// 2) Đóng gói bằng esbuild
esbuild.buildSync({
  entryPoints: ['src/entry.jsx'],
  bundle: true,
  outfile: 'public/bundle.js',
  loader: { '.jsx': 'jsx' },
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
console.log('✔ Đã đóng gói bundle.js');

// 3) Biên dịch Tailwind CSS
execSync('npx tailwindcss -i src/input.css -o public/tailwind.css --minify', { stdio: 'inherit' });
console.log('✔ Đã biên dịch tailwind.css');
