/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { type FunctionDeclaration, SchemaType } from "@google/generative-ai";
import { useEffect, useRef, useState, memo } from "react";
import vegaEmbed from "vega-embed";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { ToolCall } from "../../multimodal-live-types";
import "./Altair.css";

const modalDeclaration: FunctionDeclaration = {
  name: "show_modal",
  description: "Shows a modal dialog with the specified text content.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      title: {
        type: SchemaType.STRING,
        description: "Title of the modal dialog",
      },
      content: {
        type: SchemaType.STRING,
        description: "Content text to display in the modal",
      },
    },
    required: ["content"],
  },
};

const altairDeclaration: FunctionDeclaration = {
  name: "render_altair",
  description: "Displays an altair graph in json format.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      json_graph: {
        type: SchemaType.STRING,
        description:
          "JSON STRING representation of the graph to render. Must be a string, not a json object",
      },
    },
    required: ["json_graph"],
  },
};

function AltairComponent() {
  const [jsonString, setJSONString] = useState<string>("");
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title?: string;
    content?: string;
    functionCallId?: string;
    userInput?: string;
  }>({
    isOpen: false,
  });
  const { client, setConfig } = useLiveAPIContext();

  useEffect(() => {
    setConfig({
      model: "models/gemini-2.0-flash-exp",
      generationConfig: {
        responseModalities: "text",  // テキストモード
        // 音声モードに切り替える場合は、以下のコメントを解除し、上のtextをコメントアウト
        // responseModalities: "audio",
        // speechConfig: {
        //   voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
        // },
      },
      systemInstruction: {
        parts: [
          {
            text: 'You are my helpful assistant. You can show graphs using the "render_altair" function and display modal dialogs using the "show_modal" function. Make your best judgment about when to use each.',
          },
        ],
      },
      tools: [
        { googleSearch: {} },
        { functionDeclarations: [altairDeclaration, modalDeclaration] },
      ],
    });
  }, [setConfig]);

  useEffect(() => {
    const onToolCall = (toolCall: ToolCall) => {
      console.log(`got toolcall`, toolCall);

      // Handle modal display
      const modalCall = toolCall.functionCalls.find(
        (fc) => fc.name === modalDeclaration.name,
      );
      if (modalCall) {
        const args = modalCall.args as any;
        setModalState({
          isOpen: true,
          title: args.title,
          content: args.content,
          functionCallId: modalCall.id,
        });
        return; // 追加: モーダル表示時は即座にレスポンスを返さない
      }

      // Handle graph display
      const graphCall = toolCall.functionCalls.find(
        (fc) => fc.name === altairDeclaration.name,
      );
      if (graphCall) {
        const str = (graphCall.args as any).json_graph;
        setJSONString(str);
      }

      // Send response for all function calls except modal
      if (toolCall.functionCalls.length) {
        const nonModalCalls = toolCall.functionCalls.filter(
          (fc) => fc.name !== modalDeclaration.name
        );
        if (nonModalCalls.length > 0) {
          setTimeout(
            () =>
              client.sendToolResponse({
                functionResponses: nonModalCalls.map((fc) => ({
                  response: { output: { success: true } },
                  id: fc.id,
                })),
              }),
            200,
          );
        }
      }
    };
    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client]);

  // モーダルでの入力を処理する関数
  const handleModalSubmit = () => {
    if (modalState.userInput) {
      // ユーザーの入力を直接LLMに送信
      client.send({ text: modalState.userInput });
      setModalState({ isOpen: false });  // モーダルを閉じる
    }
  };

  const embedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (embedRef.current && jsonString) {
      vegaEmbed(embedRef.current, JSON.parse(jsonString));
    }
  }, [embedRef, jsonString]);

  return (
    <div className="altair-container">
      <div className="vega-embed" ref={embedRef} />
      {modalState.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            {modalState.title && <h2>{modalState.title}</h2>}
            <p>{modalState.content}</p>
            <input
              type="text"
              value={modalState.userInput || ""}
              onChange={(e) => setModalState(prev => ({ ...prev, userInput: e.target.value }))}
              placeholder="合言葉を入力してください"
              className="modal-input"
            />
            <div className="modal-buttons">
              <button onClick={handleModalSubmit} disabled={!modalState.userInput}>送信</button>
              <button onClick={() => setModalState({ isOpen: false })} className="cancel-button">キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const Altair = memo(AltairComponent);
