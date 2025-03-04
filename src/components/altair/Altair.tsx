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

const disconnectDeclaration: FunctionDeclaration = {
  name: "disconnect_conversation",
  description: "Disconnects from the current conversation. Use this when you want to end the conversation.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      summary: {
        type: SchemaType.STRING,
        description: "A brief summary of the conversation before disconnecting",
      },
    },
    required: ["summary"],
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

const reportToBossDeclaration: FunctionDeclaration = {
  name: "report_to_boss",
  description: "Send a report to your boss about the current conversation or task.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      report_content: {
        type: SchemaType.STRING,
        description: "The content of the report to your boss. Write in a professional and concise manner.",
      },
    },
    required: ["report_content"],
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
    // URLからパラメータを取得
    const urlParams = new URLSearchParams(window.location.search);
    const urlPrompt = urlParams.get('prompt');
    const audioMode = urlParams.get('audio') === 'true';
    // 報告ファイルのパスを取得
    const reportPath = urlParams.get('report_path');
    
    // 基本のシステムプロンプト
    const baseSystemPrompt = 'You are my helpful assistant. You can show graphs using the "render_altair" function and display modal dialogs using the "show_modal" function. Make your best judgment about when to use each.';
    
    // URLからのプロンプトがあれば、基本プロンプトと組み合わせる
    const decodedPrompt = urlPrompt ? decodeURIComponent(urlPrompt) : null;
    
    const combinedPrompt = decodedPrompt 
      ? `${baseSystemPrompt}\n\nAdditional instructions: ${decodedPrompt}`
      : baseSystemPrompt;

    // 報告パスがある場合は、それをグローバル変数として保存
    if (reportPath) {
      window._reportPath = decodeURIComponent(reportPath);
    }

    setConfig({
      model: "models/gemini-2.0-flash-exp",
      generationConfig: {
        responseModalities: audioMode ? "audio" : "text",
        ...(audioMode ? {
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
          },
        } : {}),
      },
      systemInstruction: {
        parts: [
          {
            text: combinedPrompt,
          },
        ],
      },
      tools: [
        { googleSearch: {} },
        { functionDeclarations: [altairDeclaration, modalDeclaration, disconnectDeclaration, reportToBossDeclaration] },
      ],
    });
  }, [setConfig]);

  useEffect(() => {
    const onToolCall = (toolCall: ToolCall) => {
      console.log(`got toolcall`, toolCall);

      // Handle report to boss
      const reportCall = toolCall.functionCalls.find(
        (fc) => fc.name === reportToBossDeclaration.name,
      );
      if (reportCall) {
        const args = reportCall.args as any;
        console.log(`Sending report to boss`);
        
        try {
          const requestData = {
            message: args.report_content,
            metadata: {
              timestamp: new Date().toISOString()
            }
          };

          // HTTPリクエストを送信
          fetch('http://localhost:3002/voice_conversation', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
          }).then(response => {
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
          }).then(() => {
            console.log('Report sent successfully');
            client.sendToolResponse({
              functionResponses: [{
                response: { output: { success: true } },
                id: reportCall.id,
              }],
            });
          }).catch(error => {
            console.error('Error sending report:', error);
            client.sendToolResponse({
              functionResponses: [{
                response: { 
                  output: { 
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error occurred'
                  }
                },
                id: reportCall.id,
              }],
            });
          });
        } catch (error) {
          console.error('Error in report sending:', error);
          client.sendToolResponse({
            functionResponses: [{
              response: { 
                output: { 
                  success: false,
                  error: error instanceof Error ? error.message : 'Unknown error occurred'
                }
              },
              id: reportCall.id,
            }],
          });
        }
        return;
      }

      // Handle disconnect request
      const disconnectCall = toolCall.functionCalls.find(
        (fc) => fc.name === disconnectDeclaration.name,
      );
      if (disconnectCall) {
        const args = disconnectCall.args as any;
        console.log(`Disconnecting conversation. Summary: ${args.summary}`);
        
        // まず上司に会話終了の報告を送信
        try {
          const requestData = {
            message: `会話終了報告\n\n${args.summary}`,
            metadata: {
              timestamp: new Date().toISOString(),
              event_type: 'conversation_end'
            }
          };

          // HTTPリクエストを送信
          fetch('http://localhost:3002/voice_conversation', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
          }).then(response => {
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
          }).then(() => {
            console.log('Conversation end report sent successfully');
            
            // 報告が成功したら、ツール呼び出しの成功を通知
            client.sendToolResponse({
              functionResponses: [{
                response: { output: { success: true } },
                id: disconnectCall.id,
              }],
            });

            // 少し待ってからWebSocketを切断
            setTimeout(() => {
              // 音声録音を停止（もし実行中なら）
              if (window.audioRecorder) {
                window.audioRecorder.stop();
              }
              
              // その後WebSocketを切断
              setTimeout(() => {
                client.disconnect();
              }, 500);
            }, 1000);

          }).catch(error => {
            console.error('Error sending conversation end report:', error);
            // エラーが発生しても会話は終了させる
            client.sendToolResponse({
              functionResponses: [{
                response: { 
                  output: { 
                    success: true, // 会話は終了させる
                    warning: error instanceof Error ? error.message : 'Failed to send end report'
                  }
                },
                id: disconnectCall.id,
              }],
            });
            
            // エラーが発生しても会話は終了
            setTimeout(() => {
              if (window.audioRecorder) {
                window.audioRecorder.stop();
              }
              setTimeout(() => {
                client.disconnect();
              }, 500);
            }, 1000);
          });
        } catch (error) {
          console.error('Error in conversation end process:', error);
          // エラーが発生しても会話は終了
          client.sendToolResponse({
            functionResponses: [{
              response: { 
                output: { 
                  success: true, // 会話は終了させる
                  warning: error instanceof Error ? error.message : 'Failed to send end report'
                }
              },
              id: disconnectCall.id,
            }],
          });
          
          setTimeout(() => {
            if (window.audioRecorder) {
              window.audioRecorder.stop();
            }
            setTimeout(() => {
              client.disconnect();
            }, 500);
          }, 1000);
        }
        return;
      }

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
