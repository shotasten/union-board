const fs = require('fs');
const path = require('path');

/**
 * 画像ファイルをBase64エンコードしてHTMLに埋め込む
 */
function embedIcons() {
  const htmlPath = path.join(__dirname, '../dist/index.html');
  const assetsDir = path.join(__dirname, '../src/client/assets');
  
  // HTMLファイルを読み込む
  let html = fs.readFileSync(htmlPath, 'utf8');
  
  // 画像ファイルをBase64エンコード
  const icons = {
    'favicon.ico': fs.readFileSync(path.join(assetsDir, 'favicon.ico')),
    'apple-touch-icon.png': fs.readFileSync(path.join(assetsDir, 'apple-touch-icon.png')),
    'icon-192x192.png': fs.readFileSync(path.join(assetsDir, 'icon-192x192.png'))
  };
  
  // Base64エンコード
  const faviconBase64 = icons['favicon.ico'].toString('base64');
  const appleTouchIconBase64 = icons['apple-touch-icon.png'].toString('base64');
  const icon192Base64 = icons['icon-192x192.png'].toString('base64');
  
  // MIMEタイプを判定
  const faviconMime = 'image/x-icon';
  const appleTouchIconMime = 'image/png';
  const icon192Mime = 'image/png';
  
  // HTMLの<head>タグ内にアイコンリンクを追加
  const iconLinks = `
  <!-- Favicon and App Icons -->
  <link rel="icon" type="${faviconMime}" href="data:${faviconMime};base64,${faviconBase64}">
  <link rel="apple-touch-icon" sizes="180x180" href="data:${appleTouchIconMime};base64,${appleTouchIconBase64}">
  <link rel="icon" type="${icon192Mime}" sizes="192x192" href="data:${icon192Mime};base64,${icon192Base64}">
  <!-- PWA Manifest -->
  <link rel="manifest" href="data:application/json;base64,${Buffer.from(JSON.stringify({
    name: 'UnionBoard',
    short_name: 'UnionBoard',
    icons: [
      {
        src: `data:${icon192Mime};base64,${icon192Base64}`,
        sizes: '192x192',
        type: icon192Mime
      }
    ],
    theme_color: '#667eea',
    background_color: '#ffffff',
    display: 'standalone'
  })).toString('base64')}">
  <meta name="theme-color" content="#667eea">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="UnionBoard">
`;
  
  // </head>タグの前にアイコンリンクを挿入
  if (html.includes('</head>')) {
    html = html.replace('</head>', iconLinks + '</head>');
  } else {
    // </head>タグがない場合は、<title>タグの後に追加
    html = html.replace('</title>', '</title>' + iconLinks);
  }
  
  // HTMLファイルを書き込む
  fs.writeFileSync(htmlPath, html, 'utf8');
  
  console.log('✅ アイコンとファビコンをHTMLに埋め込みました');
}

embedIcons();

