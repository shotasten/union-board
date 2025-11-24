#!/usr/bin/env node

/**
 * HTMLビルドスクリプト
 * 環境変数または.envファイルからGASアプリのURLを読み込んで、index.html.templateをビルドします
 */

const fs = require('fs');
const path = require('path');

// .envファイルを読み込む
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        process.env[key.trim()] = value;
      }
    }
  });
}

// 環境変数からURLを取得
const gasAppUrl = process.env.GAS_APP_URL;

if (!gasAppUrl) {
  console.error('❌ エラー: GAS_APP_URL環境変数が設定されていません');
  console.error('   使用方法: GAS_APP_URL=https://script.google.com/... npm run build:html');
  process.exit(1);
}

// テンプレートファイルを読み込む
const templatePath = path.join(__dirname, '..', 'public', 'index.html.template');
const outputPath = path.join(__dirname, '..', 'public', 'index.html');

if (!fs.existsSync(templatePath)) {
  console.error(`❌ エラー: テンプレートファイルが見つかりません: ${templatePath}`);
  process.exit(1);
}

try {
  let template = fs.readFileSync(templatePath, 'utf8');
  
  // プレースホルダーを置換
  template = template.replace(/\{\{GAS_APP_URL\}\}/g, gasAppUrl);
  
  // 出力ファイルに書き込む
  fs.writeFileSync(outputPath, template, 'utf8');
  
  console.log('✅ public/index.htmlをビルドしました');
  console.log(`   出力先: ${outputPath}`);
  console.log(`   URL: ${gasAppUrl.substring(0, 50)}...`);
} catch (error) {
  console.error(`❌ エラー: ビルドに失敗しました - ${error.message}`);
  process.exit(1);
}

