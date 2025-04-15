import * as vscode from 'vscode';
import axios, { AxiosError } from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

// Removed 'some-module' import as it is not used in the code

const apiKey = process.env.VSPILOT_API_KEY || vscode.workspace.getConfiguration('vspilot').get<string>('apiKey');

type ApiProvider = 'huggingface' | 'deepseek' | 'ollama';

interface ExtensionConfig {
    apiProvider: ApiProvider;
    apiKey: string;
    maxTokens: number;
    temperature: number;
    ollamaModel: string;
}

interface ApiResponse {
    generated_text?: string;
    choices?: Array<{ message?: { content?: string } }>;
    response?: string;
}

export function activate(context: vscode.ExtensionContext) {
    // Get configuration from VS Code settings
    function getConfig(): ExtensionConfig {
        const config = vscode.workspace.getConfiguration('vspilot');
        return {
            apiProvider: config.get<ApiProvider>('apiProvider') || 'huggingface',
            apiKey: apiKey || '',
            maxTokens: config.get<number>('maxTokens') || 150,
            temperature: config.get<number>('temperature') || 0.7,
            ollamaModel: config.get<string>('ollamaModel') || 'codellama'
        };
    }

    // API Providers
    const apiProviders = {
        async huggingface(prompt: string, config: ExtensionConfig): Promise<string> {
            const API_URL = "https://api-inference.huggingface.co/models/bigcode/starcoder";
            const response = await axios.post<ApiResponse>(
                API_URL,
                {
                    inputs: prompt,
                    parameters: {
                        max_new_tokens: config.maxTokens,
                        temperature: config.temperature,
                        return_full_text: false
                    }
                },
                {
                    headers: {
                        "Authorization": `Bearer ${config.apiKey}`,
                        "Content-Type": "application/json"
                    },
                    timeout: 15000
                }
            );
            return response.data.generated_text || "No response generated";
        },

        async deepseek(prompt: string, config: ExtensionConfig): Promise<string> {
            if (!config.apiKey) {
                throw new Error('DeepSeek API key is required');
            }
            const response = await axios.post<ApiResponse>(
                'https://api.deepseek.com/v1/chat/completions',
                {
                    model: "deepseek-chat",
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: config.maxTokens,
                    temperature: config.temperature
                },
                {
                    headers: {
                        'Authorization': `Bearer ${config.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                }
            );
            return response.data.choices?.[0]?.message?.content?.trim() || "No response generated";
        },

        async ollama(prompt: string, config: ExtensionConfig): Promise<string> {
            const response = await axios.post<ApiResponse>(
                'http://localhost:11434/api/generate',
                {
                    model: config.ollamaModel,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: config.temperature,
                        max_tokens: config.maxTokens
                    }
                },
                {
                    timeout: 30000
                }
            );
            return response.data.response || "No response generated";
        }
    };

    async function callLLMAssistant(prompt: string): Promise<string> {
        const config = getConfig();
        
        try {
            if (config.apiProvider === 'huggingface' && !config.apiKey) {
                const selected = await vscode.window.showInformationMessage(
                    'HuggingFace API key is recommended for better performance. Would you like to use Ollama instead?',
                    'Use Ollama', 'Continue without key'
                );
                
                if (selected === 'Use Ollama') {
                    config.apiProvider = 'ollama';
                }
            }

            const provider = apiProviders[config.apiProvider];
            if (!provider) {
                throw new Error(`Unsupported API provider: ${config.apiProvider}`);
            }

            return await provider(prompt, config);
        } catch (error) {
            console.error('API Error:', error);
            const axiosError = error as AxiosError;
            const errorMessage = axiosError.response?.data ? 
                (axiosError.response.data as any).error?.message || JSON.stringify(axiosError.response.data)
                : axiosError.message;
            
            // Suggest switching providers if error occurs
            if (axiosError.response?.status === 401 && config.apiProvider !== 'ollama') {
                const choice = await vscode.window.showErrorMessage(
                    `API Error (${config.apiProvider}): ${errorMessage}. Try Ollama?`,
                    'Switch to Ollama'
                );
                if (choice === 'Switch to Ollama') {
                    config.apiProvider = 'ollama';
                    return callLLMAssistant(prompt); // Retry
                }
            }
            
            throw new Error(`Failed to get response: ${errorMessage}`);
        }
    }

    // Command for asking questions
    context.subscriptions.push(vscode.commands.registerCommand('vspilot.ask', async () => {
        const editor = vscode.window.activeTextEditor;
        const selectedText = editor ? editor.document.getText(editor.selection) : '';
        
        const userQuery = await vscode.window.showInputBox({
            prompt: 'Ask your coding question',
            value: selectedText,
            placeHolder: 'How can I help with your code?',
            validateInput: (text) => text?.trim() ? null : 'Please enter a question'
        });

        if (!userQuery) {
            return;
        }

        try {
            const response = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "VsPilot - Processing your request",
                cancellable: true
            }, async (progress, token) => {
                token.onCancellationRequested(() => {
                    throw new Error("Request cancelled by user");
                });
                
                progress.report({ message: "Consulting AI assistant..." });
                return callLLMAssistant(userQuery);
            });

            const doc = await vscode.workspace.openTextDocument({
                content: `## Your Question\n${userQuery}\n\n## VsPilot Response\n${response}`,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
        } catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(error.message);
            } else {
                vscode.window.showErrorMessage('An unknown error occurred');
            }
        }
    }));

    // Command for direct code insertion
    context.subscriptions.push(vscode.commands.registerCommand('vspilot.insert', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const document = editor.document;
        const position = editor.selection.active;
        const textBeforeCursor = document.getText(
            new vscode.Range(new vscode.Position(0, 0), position)
        );

        try {
            const suggestion = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "VsPilot - Generating code suggestion",
                cancellable: true
            }, async (progress, token) => {
                token.onCancellationRequested(() => {
                    throw new Error("Request cancelled by user");
                });
                progress.report({ message: "Generating code..." });
                return callLLMAssistant(textBeforeCursor);
            });

            if (suggestion) {
                await editor.edit(editBuilder => {
                    editBuilder.insert(position, suggestion);
                });
            }
        } catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(error.message);
            } else {
                vscode.window.showErrorMessage('Failed to generate code suggestion');
            }
        }
    }));

    // Show welcome message with a proper disposable object
    const disposableMessage = {
        dispose: () => {
            vscode.window.showInformationMessage(
                'VsPilot activated! Use Ctrl+Alt+L to ask questions or Ctrl+Alt+K for direct code insertion.',
                'Open Settings'
            ).then(choice => {
                if (choice === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'vspilot');
                }
            });
        }
    };

    // Add the disposable object to the context subscriptions
    context.subscriptions.push(disposableMessage);
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}