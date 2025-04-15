"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
function activate(context) {
    // Get configuration from VS Code settings
    function getConfig() {
        const config = vscode.workspace.getConfiguration('vspilot');
        return {
            apiProvider: config.get('apiProvider') || 'huggingface',
            apiKey: config.get('apiKey') || '',
            maxTokens: config.get('maxTokens') || 150,
            temperature: config.get('temperature') || 0.7,
            ollamaModel: config.get('ollamaModel') || 'codellama'
        };
    }
    // API Providers
    const apiProviders = {
        async huggingface(prompt, config) {
            const API_URL = "https://api-inference.huggingface.co/models/bigcode/starcoder";
            const response = await axios_1.default.post(API_URL, {
                inputs: prompt,
                parameters: {
                    max_new_tokens: config.maxTokens,
                    temperature: config.temperature,
                    return_full_text: false
                }
            }, {
                headers: {
                    "Authorization": `Bearer ${config.apiKey}`,
                    "Content-Type": "application/json"
                },
                timeout: 15000
            });
            return response.data.generated_text || "No response generated";
        },
        async deepseek(prompt, config) {
            if (!config.apiKey) {
                throw new Error('DeepSeek API key is required');
            }
            const response = await axios_1.default.post('https://api.deepseek.com/v1/chat/completions', {
                model: "deepseek-chat",
                messages: [{ role: "user", content: prompt }],
                max_tokens: config.maxTokens,
                temperature: config.temperature
            }, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });
            return response.data.choices?.[0]?.message?.content?.trim() || "No response generated";
        },
        async ollama(prompt, config) {
            const response = await axios_1.default.post('http://localhost:11434/api/generate', {
                model: config.ollamaModel,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: config.temperature,
                    max_tokens: config.maxTokens
                }
            }, {
                timeout: 30000
            });
            return response.data.response || "No response generated";
        }
    };
    async function callLLMAssistant(prompt) {
        const config = getConfig();
        try {
            if (config.apiProvider === 'huggingface' && !config.apiKey) {
                const selected = await vscode.window.showInformationMessage('HuggingFace API key is recommended for better performance. Would you like to use Ollama instead?', 'Use Ollama', 'Continue without key');
                if (selected === 'Use Ollama') {
                    config.apiProvider = 'ollama';
                }
            }
            const provider = apiProviders[config.apiProvider];
            if (!provider) {
                throw new Error(`Unsupported API provider: ${config.apiProvider}`);
            }
            return await provider(prompt, config);
        }
        catch (error) {
            console.error('API Error:', error);
            const axiosError = error;
            const errorMessage = axiosError.response?.data ?
                axiosError.response.data.error?.message || JSON.stringify(axiosError.response.data)
                : axiosError.message;
            // Suggest switching providers if error occurs
            if (axiosError.response?.status === 401 && config.apiProvider !== 'ollama') {
                const choice = await vscode.window.showErrorMessage(`API Error (${config.apiProvider}): ${errorMessage}. Try Ollama?`, 'Switch to Ollama');
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
        }
        catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(error.message);
            }
            else {
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
        const textBeforeCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
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
        }
        catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(error.message);
            }
            else {
                vscode.window.showErrorMessage('Failed to generate code suggestion');
            }
        }
    }));
    // Show welcome message
    context.subscriptions.push({
        dispose: () => vscode.window.showInformationMessage('VsPilot activated! Use Ctrl+Alt+L to ask questions or Ctrl+Alt+K for direct code insertion.', 'Open Settings').then(choice => {
            if (choice === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'vspilot');
            }
        })
    });
}
function deactivate() { }
//# sourceMappingURL=extension.js.map