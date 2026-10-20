# MV//GEN — 音楽からMVを自動生成

音声ファイルと歌詞を入れるだけで、**ASCIIアート × 水墨画 × テクノ系モーショングラフィック** を音楽に合わせて切り替える MV をブラウザで生成します。LLM は使っていません（解析・演出はすべてルールと乱数シードで決定的に動きます）。

```bash
npx http-server -c-1 .     # 任意の静的サーバでOK
# → http://localhost:8080 を開く
```

1. 音声ファイルをドロップ（または「デモ曲で試す」）
2. 歌詞を貼る（普通のテキスト or LRC `[00:12.30]歌詞`）
3. GENERATE → ▶ でプレビュー、● EXPORT で動画 (WebM/MP4) を書き出し

## 何をしているか

| 段階 | 内容 | ファイル |
|---|---|---|
| 音声解析 | FFT → オンセット、BPM（自己相関）、ビート/小節グリッド、セクション（エネルギー変化）、アクセント | `src/audio.js` |
| 歌詞 | LRC / プレーン解析、曲構造に合わせた自動配置（ビートにスナップ）、タップ同期、日英キーワードのムード判定 | `src/lyrics.js` |
| ジャンル/スタイル | BPM・音量・明るさ・打楽器感 + 歌詞ムードで 8 系統（CYBER / ROCK / POP / LO-FI / AMBIENT / HIP-HOP / SYNTHWAVE / DARK）をスコアリングし、配色・文字セット・カット割り・エフェクト量を決定 | `src/style.js` |
| 歌詞→映像マッチ | 「月」「海」「雨」「city」等の語から、該当する ASCII アート作品・水墨画シーンを呼び出す | `src/library.js` |
| 演出 | セクション強度に応じてシーン種別を重み付き抽選、小節頭でカット、歌詞に応じて差し替え | `src/director.js` |
| レイヤー | 水墨画（shanshui）、ASCII作品（ascii-magic-art 632点）、ネイティブASCII（トンネル/3D/歌詞文字/スペクトラム/魚群/絵画のASCII化）、テクノ（パルス/グリッド/ブロック/HUD）、歌詞タイポ（impact / typewriter / split / stack / glitch / 縦書き） | `src/layers/*` |
| ポスト | フィードバック残像、RGBずれ、スライスグリッチ、ブルーム、フラッシュ、走査線、粒子、ビネット | `src/post.js` |

同じ曲・歌詞・設定なら同じ MV になります。**↻ REROLL** で別カット割りを生成。

## 同梱しているもの（vendor/）

- `vendor/shanshui` — [Leonxlnx/shanshui](https://github.com/Leonxlnx/shanshui) (MIT) @ `b5357c0`。`src/` のエンジン・シーン・トランジションをそのまま利用（lab / tools / docs は除外）。
- `vendor/ascii-magic-art` — [kailashsr38/ascii-magic-art](https://github.com/kailashsr38/ascii-magic-art) (MIT) @ `de88962`。`pieces/ lib/ runtime/`。NOTICE にある Unsplash 写真由来の `ocean-sunset` / `starry-ridge` は除外。`index.json` は `node tools/build-piece-index.mjs` で生成。

[stackedlol/ascii-sharks](https://github.com/stackedlol/ascii-sharks) はライセンス表記がないためコードは使っていません。魚群シーン（`FishSchool`）は独自実装です。

## メモ

- 水墨画は WebGL2 が必要です（無い環境では自動で他のシーンに置き換わります）。
- 書き出しはリアルタイム録画です。録画中はタブを前面に出したままにしてください。

## アーティファクト用ビルド

`npm install && npm run build:artifact` で `dist/artifact/`（MV生成ページ）と `dist/catalog/`（ASCII作品カタログ）を生成します。ローカルでは `catalog.html` でカタログを開けます。全 ASCII 作品を静的に束ねるので、ファイル数制限のある公開先でも動きます。埋め込み版ではダウンロードが使えないため EXPORT ボタンは隠れ、開いた時点でデモ曲を準備します。
