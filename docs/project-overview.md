# Multimodal Live API Web Console - プロジェクト概要

## 1. プロジェクトの基本構造

### 主要コンポーネント
- `Altair.tsx`: グラフ描画とモーダル表示を担当するメインコンポーネント
- `App.tsx`: アプリケーションのルートコンポーネント
- `multimodal-live-client.ts`: WebSocketクライアントの実装
- `audio-streamer.ts`: 音声ストリーミングの処理

### 設定
- `.env`: Gemini API キーの設定（gitignore対象）
- 環境変数: `REACT_APP_GEMINI_API_KEY`

## 2. 機能と実装

### 2.1 LLMとの対話機能
- WebSocket経由でGemini APIと通信
- 複数のモダリティ（テキスト、音声、画像）をサポート
- レスポンスモダリティの設定:
  ```typescript
  responseModalities: "text" | "audio" | "image"
  ```

### 2.2 Function Calling
#### 実装パターン
1. 関数の宣言（LLMへの情報提供）
```typescript
const declaration: FunctionDeclaration = {
  name: "function_name",
  description: "...",
  parameters: {
    type: SchemaType.OBJECT,
    properties: { ... },
    required: ["..."],
  },
};
```

2. 関数の処理（onToolCallハンドラー内）
```typescript
const onToolCall = (toolCall: ToolCall) => {
  const fc = toolCall.functionCalls.find(
    (fc) => fc.name === declaration.name,
  );
  if (fc) {
    // 関数の実際の処理
  }
};
```

3. レスポンスの送信
```typescript
client.sendToolResponse({
  functionResponses: toolCall.functionCalls.map((fc) => ({
    response: { output: { success: true } },
    id: fc.id,
  })),
});
```

### 2.3 グラフ描画機能
- Vega-Embedライブラリを使用
- LLMが生成したJSON仕様に基づいてグラフを描画
- 実装例:
```typescript
vegaEmbed(embedRef.current, JSON.parse(jsonString));
```

### 2.4 音声処理
- PCM形式の音声データをサポート
- `AudioStreamer`クラスによる音声再生の管理
- Web Audio APIを使用した実装

### 2.5 モーダル表示機能
- LLMからのコンテンツ表示用モーダルダイアログ
- スタイリングはCSS Modulesで管理
- 状態管理:
```typescript
const [modalState, setModalState] = useState<{
  isOpen: boolean;
  title?: string;
  content?: string;
}>();
```

## 3. 開発フロー

### 3.1 新機能の追加手順
1. 新しいブランチの作成
```bash
git checkout -b feature/new-feature
```

2. コンポーネントの実装
- 既存のコンポーネント（例：`Altair.tsx`）を参考に実装
- 必要なFunction Declarationの定義
- イベントハンドラーの実装
- UIコンポーネントの実装

3. スタイリングの追加
- コンポーネント固有のCSSファイルを作成
- スタイルの実装

4. 変更のコミット
```bash
git add .
git commit -m "Add new feature"
```

### 3.2 注意点
- API キーは必ず`.env`で管理
- 音声とテキストの同時受信は現状サポートされていない
- Function Callingの実装は非同期処理を考慮する必要あり

## 4. 使用しているライブラリ

### 主要な依存関係
- `vega-embed`: グラフ描画
- `@google/generative-ai`: Gemini API クライアント
- React: UIフレームワーク
- Web Audio API: 音声処理

## 5. 今後の展望

### 改善可能な点
- 音声とテキストの同時受信のサポート
- より多くのツール（関数）の追加
- エラーハンドリングの強化
- UIのカスタマイズ性の向上

### 検討中の機能
- 音声のトランスクリプション
- より高度なグラフ表示オプション
- 追加のモダリティサポート
